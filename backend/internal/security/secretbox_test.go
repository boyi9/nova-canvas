package security

import (
	"strings"
	"testing"
)

func newTestBox(t *testing.T, fill byte) *SecretBox {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = fill
	}
	box, err := NewSecretBox(key)
	if err != nil {
		t.Fatalf("NewSecretBox: %v", err)
	}
	return box
}

func TestSecretBoxRoundTrip(t *testing.T) {
	box := newTestBox(t, 1)
	plaintext := `{"provider":"deepseek","api_key":"sk-test-123","note":"中文备注"}`

	sealed, err := box.Seal(plaintext)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if !strings.HasPrefix(sealed, secretBoxVersion) {
		t.Fatalf("ciphertext missing version prefix: %q", sealed)
	}
	if strings.Contains(sealed, "sk-test-123") {
		t.Fatal("ciphertext leaks plaintext")
	}

	opened, err := box.Open(sealed)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if opened != plaintext {
		t.Fatalf("round trip mismatch: %q", opened)
	}
}

func TestSecretBoxUsesFreshNonce(t *testing.T) {
	box := newTestBox(t, 2)
	first, err := box.Seal("same plaintext")
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	second, err := box.Seal("same plaintext")
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if first == second {
		t.Fatal("expected distinct ciphertexts for identical plaintext (nonce reuse)")
	}
}

func TestSecretBoxDetectsTamperingAndWrongKey(t *testing.T) {
	box := newTestBox(t, 3)
	sealed, err := box.Seal("sensitive")
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	body := strings.TrimPrefix(sealed, secretBoxVersion)
	tampered := secretBoxVersion + body[:len(body)-2] + "AA"
	if _, err := box.Open(tampered); err == nil {
		t.Fatal("expected tampered ciphertext to be rejected")
	}

	other := newTestBox(t, 4)
	if _, err := other.Open(sealed); err == nil {
		t.Fatal("expected wrong key to fail authentication")
	}

	for name, input := range map[string]string{
		"no version": "Zm9v",
		"bad base64": secretBoxVersion + "!!!",
		"too short":  secretBoxVersion + "AAAA",
	} {
		if _, err := box.Open(input); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestNewSecretBoxRejectsBadKeys(t *testing.T) {
	if _, err := NewSecretBox(make([]byte, 16)); err == nil {
		t.Fatal("expected error for 16-byte key")
	}
	if _, err := NewSecretBoxFromBase64("not base64!!!"); err == nil {
		t.Fatal("expected error for invalid base64 key")
	}
}

func TestGeneratedKeyIsUsable(t *testing.T) {
	encoded, err := GenerateKeyBase64()
	if err != nil {
		t.Fatalf("GenerateKeyBase64: %v", err)
	}
	box, err := NewSecretBoxFromBase64(encoded)
	if err != nil {
		t.Fatalf("NewSecretBoxFromBase64: %v", err)
	}
	sealed, err := box.Seal("value")
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if opened, err := box.Open(sealed); err != nil || opened != "value" {
		t.Fatalf("round trip failed: %q %v", opened, err)
	}
}

func TestLoadSecretBoxFromEnv(t *testing.T) {
	t.Setenv(SecretKeyEnv, "")
	box, err := LoadSecretBoxFromEnv()
	if err != nil || box != nil {
		t.Fatalf("expected (nil, nil) when env is unset, got (%v, %v)", box, err)
	}

	encoded, err := GenerateKeyBase64()
	if err != nil {
		t.Fatalf("GenerateKeyBase64: %v", err)
	}
	t.Setenv(SecretKeyEnv, encoded)
	box, err = LoadSecretBoxFromEnv()
	if err != nil || box == nil {
		t.Fatalf("expected usable box, got (%v, %v)", box, err)
	}

	t.Setenv(SecretKeyEnv, "short")
	if _, err := LoadSecretBoxFromEnv(); err == nil {
		t.Fatal("expected error for malformed NOVA_SECRET_KEY")
	}
}

func TestNewRefreshTokenIsOpaqueAndHashed(t *testing.T) {
	raw, hash, err := NewRefreshToken()
	if err != nil {
		t.Fatalf("NewRefreshToken: %v", err)
	}
	if len(raw) < 40 {
		t.Fatalf("refresh token too short: %d chars", len(raw))
	}
	if hash == raw {
		t.Fatal("hash must differ from raw token")
	}
	if len(hash) != 64 {
		t.Fatalf("unexpected hash length: %d", len(hash))
	}
	if HashRefreshToken(raw) != hash {
		t.Fatal("hash is not stable")
	}

	raw2, hash2, err := NewRefreshToken()
	if err != nil {
		t.Fatalf("NewRefreshToken: %v", err)
	}
	if raw2 == raw || hash2 == hash {
		t.Fatal("expected unique refresh tokens")
	}
}
