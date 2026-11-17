package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
)

// SecretKeyEnv 是加密密钥所在的环境变量名（32 字节的 base64url 编码）。
const SecretKeyEnv = "NOVA_SECRET_KEY"

// secretBoxVersion 写入密文前缀，方便将来更换算法时平滑迁移。
const secretBoxVersion = "v1:"

// SecretBox 用 AES-256-GCM 加解密需要「可取回」的敏感数据
// （例如以环境变量下发的供应商 API Key 配置）。
// 注意：不可取回的数据（密码、会话令牌）不要用这里，应使用 bcrypt / SHA-256。
type SecretBox struct {
	aead cipher.AEAD
}

// NewSecretBox 从 32 字节原始密钥构造。
func NewSecretBox(key []byte) (*SecretBox, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("secret box key must be exactly 32 bytes (got %d)", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &SecretBox{aead: aead}, nil
}

// NewSecretBoxFromBase64 解析 base64url（无填充）编码的密钥。
func NewSecretBoxFromBase64(encoded string) (*SecretBox, error) {
	key, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", SecretKeyEnv, err)
	}
	return NewSecretBox(key)
}

// LoadSecretBoxFromEnv 读取 NOVA_SECRET_KEY；未设置时返回 (nil, nil)，
// 由调用方决定「加密配置为可选」还是「必须存在」。
func LoadSecretBoxFromEnv() (*SecretBox, error) {
	encoded := strings.TrimSpace(os.Getenv(SecretKeyEnv))
	if encoded == "" {
		return nil, nil
	}
	return NewSecretBoxFromBase64(encoded)
}

// GenerateKeyBase64 生成新的 32 字节密钥（base64url 无填充）。
func GenerateKeyBase64() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(key), nil
}

// Seal 加密明文，返回 "v1:<base64url(nonce||ciphertext)>"。
func (b *SecretBox) Seal(plaintext string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := b.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return secretBoxVersion + base64.RawURLEncoding.EncodeToString(sealed), nil
}

// Open 解密 Seal 的产物；篡改或密钥不匹配时返回错误。
func (b *SecretBox) Open(encoded string) (string, error) {
	if !strings.HasPrefix(encoded, secretBoxVersion) {
		return "", errors.New("unsupported secret format")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(encoded, secretBoxVersion))
	if err != nil {
		return "", fmt.Errorf("decode secret: %w", err)
	}
	nonceSize := b.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("secret too short")
	}
	plaintext, err := b.aead.Open(nil, raw[:nonceSize], raw[nonceSize:], nil)
	if err != nil {
		return "", errors.New("decrypt secret: authentication failed")
	}
	return string(plaintext), nil
}
