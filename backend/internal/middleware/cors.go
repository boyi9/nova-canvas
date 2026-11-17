package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CORS 只对白名单来源回显 Access-Control-Allow-Origin，
// 并始终发送 Vary: Origin，避免共享缓存把一个来源的响应发给另一个来源。
func CORS(origins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[origin] = struct{}{}
	}
	return func(c *gin.Context) {
		c.Writer.Header().Add("Vary", "Origin")

		origin := c.GetHeader("Origin")
		_, ok := allowed[origin]
		if ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-Requested-With")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			if !ok {
				// 不在白名单的预检直接拒绝，避免缓存或中间件误判为「已授权」
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
