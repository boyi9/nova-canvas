package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// RefreshTokenBytes 是不透明刷新令牌的随机字节数（256 bit）。
const RefreshTokenBytes = 32

// NewRefreshToken 生成不透明刷新令牌，返回「明文（仅下发给客户端）」与「哈希（入库）」。
// 数据库只保存哈希：即使库被读走，也无法离线重放用户会话。
func NewRefreshToken() (raw string, hash string, err error) {
	buf := make([]byte, RefreshTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate refresh token: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, HashRefreshToken(raw), nil
}

// HashRefreshToken 计算刷新令牌的 SHA-256 十六进制摘要（长度固定 64）。
// 刷新令牌是高熵随机值，无需加盐慢哈希；用 sha256 保证查表 O(1)。
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
