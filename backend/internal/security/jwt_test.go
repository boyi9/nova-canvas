package security

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func testManager(t *testing.T, secret string, ttl time.Duration) *TokenManager {
	t.Helper()
	m, err := NewTokenManager([]byte(secret), "nova-canvas-test", ttl)
	if err != nil {
		t.Fatalf("NewTokenManager: %v", err)
	}
	return m
}

func TestTokenManagerRejectsWeakConfig(t *testing.T) {
	short := strings.Repeat("k", MinSecretLen-1)
	if _, err := NewTokenManager([]byte(short), "issuer", time.Minute); err == nil {
		t.Fatal("expected error for short secret")
	}
	if _, err := NewTokenManager([]byte(strings.Repeat("k", MinSecretLen)), "", time.Minute); err == nil {
		t.Fatal("expected error for empty issuer")
	}
	if _, err := NewTokenManager([]byte(strings.Repeat("k", MinSecretLen)), "issuer", 0); err == nil {
		t.Fatal("expected error for non-positive TTL")
	}
}

func TestIssueParseRoundTrip(t *testing.T) {
	secret := strings.Repeat("s", 32)
	m := testManager(t, secret, 15*time.Minute)

	raw, expiresAt, err := m.Issue("user-1", "user@example.com")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if time.Until(expiresAt) <= 0 || time.Until(expiresAt) > 16*time.Minute {
		t.Fatalf("unexpected expiry: %v", expiresAt)
	}
	if m.TTL() != 15*time.Minute {
		t.Fatalf("TTL() = %v", m.TTL())
	}

	claims, err := m.Parse(raw)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if claims.UserID != "user-1" || claims.Email != "user@example.com" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if claims.TokenType != TokenTypeAccess {
		t.Fatalf("unexpected token type: %q", claims.TokenType)
	}
}

func TestParseRejectsWrongAlgorithm(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	m := testManager(t, string(secret), 15*time.Minute)
	claims := AccessClaims{
		UserID:    "user-1",
		Email:     "user@example.com",
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "nova-canvas-test",
			Subject:   "user-1",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}

	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}
	if _, err := m.Parse(none); err == nil {
		t.Fatal("expected alg=none token to be rejected")
	}

	hs512, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(secret)
	if err != nil {
		t.Fatalf("sign hs512: %v", err)
	}
	if _, err := m.Parse(hs512); err == nil {
		t.Fatal("expected HS512 token to be rejected")
	}
}

func TestParseRejectsInvalidClaims(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	m := testManager(t, string(secret), 15*time.Minute)
	build := func(mutate func(*AccessClaims)) string {
		claims := AccessClaims{
			UserID:    "user-1",
			Email:     "user@example.com",
			TokenType: TokenTypeAccess,
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "nova-canvas-test",
				Subject:   "user-1",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		mutate(&claims)
		raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
		if err != nil {
			t.Fatalf("sign: %v", err)
		}
		return raw
	}

	cases := map[string]string{
		"expired":       build(func(c *AccessClaims) { c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute)) }),
		"no exp":        build(func(c *AccessClaims) { c.ExpiresAt = nil }),
		"wrong issuer":  build(func(c *AccessClaims) { c.Issuer = "somebody-else" }),
		"wrong typ":     build(func(c *AccessClaims) { c.TokenType = "refresh" }),
		"empty user":    build(func(c *AccessClaims) { c.UserID = "" }),
		"empty subject": build(func(c *AccessClaims) { c.Subject = "" }),
	}
	for name, raw := range cases {
		if _, err := m.Parse(raw); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
}

func TestParseRejectsTamperedSignature(t *testing.T) {
	m := testManager(t, strings.Repeat("s", 32), 15*time.Minute)
	raw, _, err := m.Issue("user-1", "user@example.com")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	// 篡改最后一个字符会破坏签名
	last := raw[len(raw)-1]
	replacement := byte('A')
	if last == 'A' {
		replacement = 'B'
	}
	tampered := raw[:len(raw)-1] + string(replacement)
	if _, err := m.Parse(tampered); err == nil {
		t.Fatal("expected tampered token to be rejected")
	}

	other := testManager(t, strings.Repeat("x", 32), 15*time.Minute)
	if _, err := other.Parse(raw); err == nil {
		t.Fatal("expected token signed with another secret to be rejected")
	}
}
