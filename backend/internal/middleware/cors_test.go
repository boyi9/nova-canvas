package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func corsRouter(origins ...string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS(origins))
	r.GET("/ping", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.POST("/ping", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func TestCORSAllowsWhitelistedOrigin(t *testing.T) {
	r := corsRouter("https://app.example.com")
	req := httptest.NewRequest(http.MethodOptions, "/ping", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Errorf("Allow-Origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Allow-Credentials = %q", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q", got)
	}
	// 不存在的来源不能被回显
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
		t.Error("wildcard origin must not be used")
	}
}

func TestCORSRejectsUnknownOrigin(t *testing.T) {
	r := corsRouter("https://app.example.com")

	preflight := httptest.NewRequest(http.MethodOptions, "/ping", nil)
	preflight.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, preflight)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("preflight status = %d, want 403", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unexpected Allow-Origin: %q", got)
	}

	// 普通请求仍然放行，但不授予跨域读取权限
	simple := httptest.NewRequest(http.MethodGet, "/ping", nil)
	simple.Header.Set("Origin", "https://evil.example.com")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, simple)
	if rec.Code != http.StatusOK {
		t.Fatalf("simple status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unexpected Allow-Origin: %q", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q", got)
	}
}

func TestCORSAlwaysSendsVary(t *testing.T) {
	r := corsRouter("https://app.example.com")
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary = %q, want Origin even without Origin header", got)
	}
}

func TestSecurityHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SecurityHeaders())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	want := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
		"Cache-Control":          "no-store",
	}
	for header, value := range want {
		if got := rec.Header().Get(header); got != value {
			t.Errorf("%s = %q, want %q", header, got, value)
		}
	}
}
