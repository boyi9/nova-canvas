package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"nova-canvas-backend/internal/security"
)

func authRouter(t *testing.T) (*gin.Engine, *security.TokenManager) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	tokens, err := security.NewTokenManager([]byte(strings.Repeat("k", 32)), "nova-canvas-test", 15*time.Minute)
	if err != nil {
		t.Fatalf("NewTokenManager: %v", err)
	}
	r := gin.New()
	r.Use(Auth(tokens))
	r.GET("/me", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"user_id": c.GetString(ContextUserID), "email": c.GetString(ContextEmail)})
	})
	return r, tokens
}

func TestAuthMiddlewareAcceptsValidToken(t *testing.T) {
	r, tokens := authRouter(t)
	raw, _, err := tokens.Issue("user-1", "user@example.com")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "user-1") || !strings.Contains(body, "user@example.com") {
		t.Fatalf("unexpected body: %s", body)
	}
}

func TestAuthMiddlewareRejectsInvalidHeaders(t *testing.T) {
	r, tokens := authRouter(t)
	valid, _, err := tokens.Issue("user-1", "user@example.com")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	// 非 access 类型的令牌（即使签名正确）也不能通过
	refreshClaims := security.AccessClaims{
		UserID:    "user-1",
		TokenType: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "nova-canvas-test",
			Subject:   "user-1",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString([]byte(strings.Repeat("k", 32)))
	if err != nil {
		t.Fatalf("sign refresh token: %v", err)
	}

	cases := map[string]string{
		"missing header": "",
		"wrong scheme":   "Basic " + valid,
		"no token":       "Bearer ",
		"garbage":        "Bearer not-a-jwt",
		"refresh type":   "Bearer " + refreshToken,
	}
	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/me", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
		})
	}
}
