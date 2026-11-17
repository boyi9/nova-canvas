package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRateLimitAllowsBurstThenRejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RateLimit(1, 1))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = "203.0.113.7:12345"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("first request status = %d, want 200", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = "203.0.113.7:12345"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second request status = %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got == "" {
		t.Error("expected Retry-After header")
	}

	// 其他 IP 不受影响
	req = httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = "203.0.113.8:12345"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("other IP status = %d, want 200", rec.Code)
	}
}
