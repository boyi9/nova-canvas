package config

import (
	"strings"
	"testing"
	"time"
)

// clearSecurityEnv 把安全相关变量置空（Load 将空值视为未设置）。
func clearSecurityEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"JWT_SECRET", "JWT_ISSUER", "JWT_ACCESS_TTL", "JWT_REFRESH_TTL",
		"AUTH_COOKIE_SECURE", "AUTH_COOKIE_DOMAIN",
		"CORS_ALLOWED_ORIGINS", "RATE_LIMIT_RPS", "RATE_LIMIT_BURST", "TRUSTED_PROXIES",
	} {
		t.Setenv(key, "")
	}
}

func TestLoadRequiresJWTSecret(t *testing.T) {
	clearSecurityEnv(t)
	if _, err := Load(); err == nil {
		t.Fatal("expected error when JWT_SECRET is missing")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearSecurityEnv(t)
	t.Setenv("JWT_SECRET", strings.Repeat("s", 32))

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Auth.AccessTTL != defaultAccessTTL {
		t.Errorf("AccessTTL = %v, want %v", cfg.Auth.AccessTTL, defaultAccessTTL)
	}
	if cfg.Auth.RefreshTTL != defaultRefreshTTL {
		t.Errorf("RefreshTTL = %v, want %v", cfg.Auth.RefreshTTL, defaultRefreshTTL)
	}
	if cfg.Auth.Issuer != defaultIssuer {
		t.Errorf("Issuer = %q, want %q", cfg.Auth.Issuer, defaultIssuer)
	}
	if cfg.Auth.CookieSecure {
		t.Error("CookieSecure should default to false for local HTTP")
	}
	if len(cfg.CORS.AllowedOrigins) != 2 {
		t.Errorf("default origins = %v", cfg.CORS.AllowedOrigins)
	}
	if cfg.RateLimit.RPS != 5 || cfg.RateLimit.Burst != 10 {
		t.Errorf("default rate limit = %+v", cfg.RateLimit)
	}
	if len(cfg.TrustedProxies) != 0 {
		t.Errorf("trusted proxies should default to none, got %v", cfg.TrustedProxies)
	}
}

func TestLoadOverrides(t *testing.T) {
	clearSecurityEnv(t)
	t.Setenv("JWT_SECRET", strings.Repeat("s", 40))
	t.Setenv("JWT_ISSUER", "my-issuer")
	t.Setenv("JWT_ACCESS_TTL", "30m")
	t.Setenv("JWT_REFRESH_TTL", "24h")
	t.Setenv("AUTH_COOKIE_SECURE", "true")
	t.Setenv("AUTH_COOKIE_DOMAIN", ".example.com")
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example.com , https://admin.example.com ")
	t.Setenv("RATE_LIMIT_RPS", "2.5")
	t.Setenv("RATE_LIMIT_BURST", "7")
	t.Setenv("TRUSTED_PROXIES", " 127.0.0.1 , 10.0.0.0/8 , ")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Auth.AccessTTL != 30*time.Minute || cfg.Auth.RefreshTTL != 24*time.Hour {
		t.Errorf("unexpected TTLs: %+v", cfg.Auth)
	}
	if !cfg.Auth.CookieSecure || cfg.Auth.CookieDomain != ".example.com" {
		t.Errorf("unexpected cookie config: %+v", cfg.Auth)
	}
	if len(cfg.Auth.JWTSecret) != 40 {
		t.Errorf("unexpected secret length: %d", len(cfg.Auth.JWTSecret))
	}
	if len(cfg.CORS.AllowedOrigins) != 2 || cfg.CORS.AllowedOrigins[0] != "https://app.example.com" {
		t.Errorf("origins not trimmed: %v", cfg.CORS.AllowedOrigins)
	}
	if cfg.RateLimit.RPS != 2.5 || cfg.RateLimit.Burst != 7 {
		t.Errorf("unexpected rate limit: %+v", cfg.RateLimit)
	}
	if len(cfg.TrustedProxies) != 2 || cfg.TrustedProxies[0] != "127.0.0.1" || cfg.TrustedProxies[1] != "10.0.0.0/8" {
		t.Errorf("unexpected trusted proxies: %v", cfg.TrustedProxies)
	}
}

func TestLoadRejectsUnsafeCORS(t *testing.T) {
	cases := map[string]string{
		"wildcard":    "*",
		"no scheme":   "example.com",
		"only commas": " , ",
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) {
			clearSecurityEnv(t)
			t.Setenv("JWT_SECRET", strings.Repeat("s", 32))
			t.Setenv("CORS_ALLOWED_ORIGINS", value)
			if _, err := Load(); err == nil {
				t.Fatalf("expected error for CORS_ALLOWED_ORIGINS=%q", value)
			}
		})
	}
}

func TestLoadRejectsBadDurationsAndLimits(t *testing.T) {
	cases := map[string]map[string]string{
		"access ttl too long": {"JWT_ACCESS_TTL": "25h"},
		"access ttl invalid":  {"JWT_ACCESS_TTL": "fifteen-minutes"},
		"access ttl zero":     {"JWT_ACCESS_TTL": "0s"},
		"refresh ttl invalid": {"JWT_REFRESH_TTL": "-1h"},
		"rps not a number":    {"RATE_LIMIT_RPS": "fast"},
		"rps zero":            {"RATE_LIMIT_RPS": "0"},
		"burst zero":          {"RATE_LIMIT_BURST": "0"},
	}
	for name, env := range cases {
		t.Run(name, func(t *testing.T) {
			clearSecurityEnv(t)
			t.Setenv("JWT_SECRET", strings.Repeat("s", 32))
			for key, value := range env {
				t.Setenv(key, value)
			}
			if _, err := Load(); err == nil {
				t.Fatalf("expected error for %v", env)
			}
		})
	}
}
