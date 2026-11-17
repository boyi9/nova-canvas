package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"nova-canvas-backend/internal/security"
)

// Gin context 键名：handlers 通过这两个键读取当前用户身份。
const (
	ContextUserID = "user_id"
	ContextEmail  = "email"
)

func abortUnauthorized(c *gin.Context, detail string) {
	c.JSON(http.StatusUnauthorized, gin.H{
		"error": gin.H{"code": http.StatusUnauthorized, "message": "Unauthorized", "detail": detail},
	})
	c.Abort()
}

// Auth 校验 Bearer 访问令牌。令牌必须是通过显式限定算法的 HS256 签名、
// issuer 匹配、带 exp 且 typ=access；任何异常统一返回 401，不泄露原因。
func Auth(tokens *security.TokenManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			abortUnauthorized(c, "Authorization header required")
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			abortUnauthorized(c, "Authorization format must be: Bearer <token>")
			return
		}
		claims, err := tokens.Parse(strings.TrimSpace(parts[1]))
		if err != nil {
			abortUnauthorized(c, "Invalid or expired token")
			return
		}
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextEmail, claims.Email)
		c.Next()
	}
}
