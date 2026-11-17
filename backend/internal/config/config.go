package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config 汇总安全相关的运行期配置。所有取值来自环境变量，
// 缺失时用安全默认值，非法时在启动阶段直接失败（fail fast）。
type Config struct {
	Auth           AuthConfig
	CORS           CORSConfig
	RateLimit      RateLimitConfig
	TrustedProxies []string
}

type AuthConfig struct {
	JWTSecret    []byte
	Issuer       string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	CookieSecure bool
	CookieDomain string
}

type CORSConfig struct {
	AllowedOrigins []string
}

type RateLimitConfig struct {
	RPS   float64
	Burst int
}

const (
	defaultAccessTTL  = 15 * time.Minute
	defaultRefreshTTL = 30 * 24 * time.Hour
	defaultIssuer     = "nova-canvas"
	maxAccessTTL      = 24 * time.Hour
)

// Load 读取并校验安全配置。
func Load() (*Config, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required (generate with: openssl rand -hex 32)")
	}

	accessTTL, err := durationEnv("JWT_ACCESS_TTL", defaultAccessTTL)
	if err != nil {
		return nil, err
	}
	if accessTTL > maxAccessTTL {
		return nil, fmt.Errorf("JWT_ACCESS_TTL must not exceed %s", maxAccessTTL)
	}
	refreshTTL, err := durationEnv("JWT_REFRESH_TTL", defaultRefreshTTL)
	if err != nil {
		return nil, err
	}

	origins, err := parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if err != nil {
		return nil, err
	}

	rps, err := floatEnv("RATE_LIMIT_RPS", 5)
	if err != nil {
		return nil, err
	}
	burst, err := intEnv("RATE_LIMIT_BURST", 10)
	if err != nil {
		return nil, err
	}
	if rps <= 0 || burst <= 0 {
		return nil, fmt.Errorf("RATE_LIMIT_RPS and RATE_LIMIT_BURST must be positive")
	}

	issuer := strings.TrimSpace(os.Getenv("JWT_ISSUER"))
	if issuer == "" {
		issuer = defaultIssuer
	}

	return &Config{
		Auth: AuthConfig{
			JWTSecret:    []byte(secret),
			Issuer:       issuer,
			AccessTTL:    accessTTL,
			RefreshTTL:   refreshTTL,
			CookieSecure: boolEnv("AUTH_COOKIE_SECURE", false),
			CookieDomain: strings.TrimSpace(os.Getenv("AUTH_COOKIE_DOMAIN")),
		},
		CORS:           CORSConfig{AllowedOrigins: origins},
		RateLimit:      RateLimitConfig{RPS: rps, Burst: burst},
		TrustedProxies: parseList(os.Getenv("TRUSTED_PROXIES")),
	}, nil
}

// parseList 解析逗号分隔的列表，忽略空项。
func parseList(raw string) []string {
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			values = append(values, value)
		}
	}
	return values
}

// parseOrigins 解析逗号分隔的来源白名单。
// 明确拒绝 "*"：允许凭据（Cookie）时通配来源等于把所有站点都加入白名单。
func parseOrigins(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return []string{"http://localhost:3000", "http://localhost:5173"}, nil
	}
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if origin == "*" {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS must not contain \"*\" when credentials are enabled")
		}
		if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
			return nil, fmt.Errorf("CORS origin %q must include scheme (http:// or https://)", origin)
		}
		origins = append(origins, origin)
	}
	if len(origins) == 0 {
		return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS is empty")
	}
	return origins, nil
}

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	if value <= 0 {
		return 0, fmt.Errorf("%s must be positive", key)
	}
	return value, nil
}

func floatEnv(key string, fallback float64) (float64, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return value, nil
}

func intEnv(key string, fallback int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return value, nil
}

func boolEnv(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}
