package security

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenTypeAccess 标记访问令牌，避免 refresh / 其他用途令牌被当作 access token 使用。
const TokenTypeAccess = "access"

// MinSecretLen JWT 密钥最小长度（HS256 建议至少 256 bit）。
const MinSecretLen = 32

// AccessClaims 是访问令牌的载荷。只放身份标识，不放权限等易变数据，
// 权限以服务端查询为准，避免令牌被长期信任过期缓存。
type AccessClaims struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	TokenType string `json:"typ"`
	jwt.RegisteredClaims
}

// TokenManager 负责访问令牌的签发与校验。
type TokenManager struct {
	secret    []byte
	issuer    string
	accessTTL time.Duration
}

// NewTokenManager 校验密钥强度后构造管理器。空密钥或过短密钥直接报错，
// 让配置问题在进程启动时暴露，而不是等到第一次登录才 panic。
func NewTokenManager(secret []byte, issuer string, accessTTL time.Duration) (*TokenManager, error) {
	if len(secret) < MinSecretLen {
		return nil, fmt.Errorf("JWT secret must be at least %d bytes (got %d)", MinSecretLen, len(secret))
	}
	if issuer == "" {
		return nil, errors.New("JWT issuer must not be empty")
	}
	if accessTTL <= 0 {
		return nil, errors.New("access token TTL must be positive")
	}
	return &TokenManager{secret: secret, issuer: issuer, accessTTL: accessTTL}, nil
}

// Issue 签发访问令牌，返回令牌与过期时间。
func (m *TokenManager) Issue(userID, email string) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(m.accessTTL)
	claims := AccessClaims{
		UserID:    userID,
		Email:     email,
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// Parse 校验访问令牌。显式限定签名算法（禁止 alg=none / 算法混淆）、
// 校验 issuer、要求 exp 存在，并拒绝非 access 类型的令牌。
func (m *TokenManager) Parse(raw string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(*jwt.Token) (any, error) {
		return m.secret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(m.issuer),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.TokenType != TokenTypeAccess {
		return nil, errors.New("invalid token type")
	}
	if claims.UserID == "" || claims.Subject == "" {
		return nil, errors.New("missing user identity")
	}
	return claims, nil
}

// TTL 返回访问令牌有效期，供响应体的 expires_in 使用。
func (m *TokenManager) TTL() time.Duration { return m.accessTTL }
