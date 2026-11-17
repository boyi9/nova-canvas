package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/models"
	"nova-canvas-backend/internal/repository"
	"nova-canvas-backend/internal/security"
)

const (
	// refreshCookieName 存放刷新令牌；HttpOnly + SameSite=Lax，JS 无法读取。
	refreshCookieName = "nova_refresh"
	// refreshCookiePath 限制 Cookie 只发给认证端点，业务请求不携带。
	refreshCookiePath = "/api/v1/auth"
	// refreshRequestHeader 是刷新接口要求的自定义头：跨站表单无法携带自定义头，
	// 配合 SameSite=Lax 构成 CSRF 纵深防御。
	refreshRequestHeader = "X-Requested-With"
)

// EnableAuth 注入认证依赖。存量的 handler 测试无需构造这些依赖，
// 因此保持 NewHandler 签名的兼容性，由 main 显式启用。
func (h *Handler) EnableAuth(tokens *security.TokenManager, refreshTokens repository.RefreshTokenRepository, refreshTTL time.Duration, cookieSecure bool, cookieDomain string) {
	h.Tokens = tokens
	h.RefreshTokens = refreshTokens
	h.RefreshTTL = refreshTTL
	h.CookieSecure = cookieSecure
	h.CookieDomain = cookieDomain
}

func (h *Handler) authEnabled() bool {
	return h.Tokens != nil && h.RefreshTokens != nil
}

// issueSession 签发访问令牌并创建轮换式刷新令牌记录，同时写入 HttpOnly Cookie。
func (h *Handler) issueSession(c *gin.Context, user *models.User) (string, error) {
	if !h.authEnabled() {
		return "", errors.New("authentication is not configured")
	}
	access, _, err := h.Tokens.Issue(user.ID.String(), user.Email)
	if err != nil {
		return "", err
	}
	rawRefresh, hash, err := security.NewRefreshToken()
	if err != nil {
		return "", err
	}
	now := time.Now()
	record := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hash,
		ExpiresAt: now.Add(h.RefreshTTL),
	}
	if err := h.RefreshTokens.Create(c.Request.Context(), record); err != nil {
		return "", err
	}
	// 顺带清理自然过期的记录；失败不影响本次登录。
	_ = h.RefreshTokens.DeleteExpired(c.Request.Context(), now)

	h.setRefreshCookie(c, rawRefresh, h.RefreshTTL)
	return access, nil
}

func (h *Handler) setRefreshCookie(c *gin.Context, value string, ttl time.Duration) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		refreshCookieName,
		value,
		int(ttl.Seconds()),
		refreshCookiePath,
		h.CookieDomain,
		h.CookieSecure,
		true, // HttpOnly
	)
}

func (h *Handler) clearRefreshCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(refreshCookieName, "", -1, refreshCookiePath, h.CookieDomain, h.CookieSecure, true)
}

func (h *Handler) sessionResponse(user *models.User, access string) gin.H {
	return gin.H{
		"user":         user,
		"token":        access, // 兼容旧客户端字段
		"access_token": access,
		"token_type":   "Bearer",
		"expires_in":   int(h.Tokens.TTL().Seconds()),
	}
}

// Refresh 用轮换式刷新令牌换取新的访问令牌。
// 安全要点：只接受 Cookie；要求自定义头；旧令牌立即撤销；
// 已撤销令牌被再次使用时视为泄露信号，撤销该用户全部会话。
func (h *Handler) Refresh(c *gin.Context) {
	if !h.authEnabled() {
		errs.RespondError(c, errs.ErrInternal("authentication is not configured"))
		return
	}
	if c.GetHeader(refreshRequestHeader) != "XMLHttpRequest" {
		errs.RespondError(c, errs.ErrUnauthorized("missing "+refreshRequestHeader+" header"))
		return
	}
	raw, err := c.Cookie(refreshCookieName)
	if err != nil || raw == "" {
		errs.RespondError(c, errs.ErrUnauthorized("refresh token required"))
		return
	}

	now := time.Now()
	record, err := h.RefreshTokens.FindByHash(c.Request.Context(), security.HashRefreshToken(raw))
	if err != nil {
		// 未知令牌：不区分「不存在」与「格式错误」，避免枚举
		h.clearRefreshCookie(c)
		errs.RespondError(c, errs.ErrUnauthorized("invalid refresh token"))
		return
	}

	if !record.IsActive(now) {
		if record.RevokedAt != nil {
			// 令牌重放：立即吊销该用户所有会话
			_ = h.RefreshTokens.RevokeAllByUser(c.Request.Context(), record.UserID)
		}
		h.clearRefreshCookie(c)
		errs.RespondError(c, errs.ErrUnauthorized("refresh token expired or revoked"))
		return
	}

	user, err := h.Users.FindByID(c.Request.Context(), record.UserID)
	if err != nil {
		h.clearRefreshCookie(c)
		errs.RespondError(c, errs.ErrUnauthorized("user no longer exists"))
		return
	}

	// 轮换：先撤销旧令牌，再签发新会话（旧 Cookie 值随即失效）
	if err := h.RefreshTokens.Revoke(c.Request.Context(), record.ID); err != nil {
		errs.RespondError(c, errs.ErrInternal("failed to rotate refresh token"))
		return
	}
	access, err := h.issueSession(c, user)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("failed to issue session"))
		return
	}
	c.JSON(http.StatusOK, h.sessionResponse(user, access))
}

// Logout 撤销当前刷新令牌并清除 Cookie。即使令牌已过期也返回 204，
// 避免把「是否登录」变成可探测的信息。
func (h *Handler) Logout(c *gin.Context) {
	if raw, err := c.Cookie(refreshCookieName); err == nil && raw != "" && h.RefreshTokens != nil {
		if record, findErr := h.RefreshTokens.FindByHash(c.Request.Context(), security.HashRefreshToken(raw)); findErr == nil {
			_ = h.RefreshTokens.Revoke(c.Request.Context(), record.ID)
		}
	}
	h.clearRefreshCookie(c)
	c.Status(http.StatusNoContent)
}
