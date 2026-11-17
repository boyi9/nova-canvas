package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
	"nova-canvas-backend/internal/errs"
)

// RateLimit 按客户端 IP 做令牌桶限流，用于登录/注册/刷新等认证入口，
// 抵御撞库与令牌暴力枚举。每个中间件实例持有独立的桶表（便于测试隔离）。
func RateLimit(rps float64, burst int) gin.HandlerFunc {
	type bucket struct {
		limiter  *rate.Limiter
		lastSeen time.Time
	}
	var (
		mu      sync.Mutex
		buckets = make(map[string]*bucket)
	)

	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		b, ok := buckets[ip]
		if !ok {
			b = &bucket{limiter: rate.NewLimiter(rate.Limit(rps), burst)}
			buckets[ip] = b
		}
		b.lastSeen = time.Now()
		allowed := b.limiter.Allow()
		// 防止 IP 表无限膨胀：超过阈值时清理 10 分钟未活跃的桶
		if len(buckets) > 4096 {
			for key, value := range buckets {
				if key != ip && time.Since(value.lastSeen) > 10*time.Minute {
					delete(buckets, key)
				}
			}
		}
		mu.Unlock()

		if !allowed {
			c.Header("Retry-After", "1")
			errs.RespondError(c, errs.ErrRateLimited("too many requests, retry later"))
			c.Abort()
			return
		}
		c.Next()
	}
}
