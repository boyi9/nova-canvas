package middleware

import (
	"github.com/gin-gonic/gin"
)

// SecurityHeaders 为所有 API 响应补充基础安全头。
// API 只返回 JSON：禁止 MIME 嗅探、禁止被 iframe 嵌入、不向第三方泄露 Referer，
// 并且用户数据不做任何缓存（除非显式覆盖）。
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Cache-Control", "no-store")
		c.Next()
	}
}
