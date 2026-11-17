package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"nova-canvas-backend/internal/models"
	"nova-canvas-backend/internal/security"
)

const testPassword = "correct-horse-battery"

var errFakeNotFound = errors.New("record not found")

// ---------- fakes ----------

type fakeUserRepo struct {
	mu    sync.Mutex
	users map[uuid.UUID]*models.User
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{users: map[uuid.UUID]*models.User{}}
}

func (r *fakeUserRepo) Create(_ context.Context, user *models.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.users {
		if existing.Email == user.Email {
			return errors.New("duplicate email")
		}
	}
	clone := *user
	r.users[user.ID] = &clone
	return nil
}

func (r *fakeUserRepo) FindByID(_ context.Context, id uuid.UUID) (*models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if user, ok := r.users[id]; ok {
		clone := *user
		return &clone, nil
	}
	return nil, errFakeNotFound
}

func (r *fakeUserRepo) FindByEmail(_ context.Context, email string) (*models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, user := range r.users {
		if user.Email == email {
			clone := *user
			return &clone, nil
		}
	}
	return nil, errFakeNotFound
}

func (r *fakeUserRepo) Update(_ context.Context, user *models.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	clone := *user
	r.users[user.ID] = &clone
	return nil
}

func (r *fakeUserRepo) UpdateCredits(_ context.Context, id uuid.UUID, delta int) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	user, ok := r.users[id]
	if !ok {
		return 0, errFakeNotFound
	}
	user.Credits += delta
	return user.Credits, nil
}

func (r *fakeUserRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.users, id)
	return nil
}

type fakeRefreshRepo struct {
	mu      sync.Mutex
	records map[uuid.UUID]*models.RefreshToken
}

func newFakeRefreshRepo() *fakeRefreshRepo {
	return &fakeRefreshRepo{records: map[uuid.UUID]*models.RefreshToken{}}
}

func (r *fakeRefreshRepo) Create(_ context.Context, token *models.RefreshToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	clone := *token
	r.records[token.ID] = &clone
	return nil
}

func (r *fakeRefreshRepo) FindByHash(_ context.Context, hash string) (*models.RefreshToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, record := range r.records {
		if record.TokenHash == hash {
			clone := *record
			return &clone, nil
		}
	}
	return nil, errFakeNotFound
}

func (r *fakeRefreshRepo) Revoke(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if record, ok := r.records[id]; ok && record.RevokedAt == nil {
		now := time.Now()
		record.RevokedAt = &now
	}
	return nil
}

func (r *fakeRefreshRepo) RevokeAllByUser(_ context.Context, userID uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, record := range r.records {
		if record.UserID == userID && record.RevokedAt == nil {
			record.RevokedAt = &now
		}
	}
	return nil
}

func (r *fakeRefreshRepo) DeleteExpired(_ context.Context, now time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	// 与 Postgres 实现一致：只删自然过期，保留已撤销记录用于重放检测
	for id, record := range r.records {
		if now.After(record.ExpiresAt) {
			delete(r.records, id)
		}
	}
	return nil
}

func (r *fakeRefreshRepo) all() []*models.RefreshToken {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*models.RefreshToken, 0, len(r.records))
	for _, record := range r.records {
		clone := *record
		out = append(out, &clone)
	}
	return out
}

func (r *fakeRefreshRepo) activeCount(userID uuid.UUID) int {
	count := 0
	for _, record := range r.all() {
		if record.UserID == userID && record.IsActive(time.Now()) {
			count++
		}
	}
	return count
}

// ---------- helpers ----------

func setupAuthRouter(t *testing.T) (*gin.Engine, *Handler, *fakeUserRepo, *fakeRefreshRepo, *security.TokenManager) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	users := newFakeUserRepo()
	refresh := newFakeRefreshRepo()
	tokens, err := security.NewTokenManager([]byte(strings.Repeat("k", 32)), "nova-canvas-test", 15*time.Minute)
	if err != nil {
		t.Fatalf("NewTokenManager: %v", err)
	}

	h := NewHandler(users, nil, nil, nil)
	h.EnableAuth(tokens, refresh, 30*24*time.Hour, false, "")

	r := gin.New()
	v1 := r.Group("/api/v1")
	v1.POST("/auth/register", h.Register)
	v1.POST("/auth/login", h.Login)
	v1.POST("/auth/refresh", h.Refresh)
	v1.POST("/auth/logout", h.Logout)
	return r, h, users, refresh, tokens
}

func seedUser(t *testing.T, repo *fakeUserRepo) *models.User {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	user := &models.User{
		ID:       uuid.New(),
		Email:    "user@example.com",
		Password: string(hash),
		Name:     "Test User",
		Plan:     "free",
		Credits:  100,
	}
	if err := repo.Create(context.Background(), user); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return user
}

func doJSON(t *testing.T, r *gin.Engine, method, path string, body any, cookies []*http.Cookie, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(payload)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func findCookie(t *testing.T, rec *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func login(t *testing.T, r *gin.Engine) (*httptest.ResponseRecorder, *http.Cookie) {
	t.Helper()
	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email":    "user@example.com",
		"password": testPassword,
	}, nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", rec.Code, rec.Body.String())
	}
	cookie := findCookie(t, rec, refreshCookieName)
	if cookie == nil {
		t.Fatal("login response missing refresh cookie")
	}
	return rec, cookie
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v (body=%s)", err, rec.Body.String())
	}
	return body
}

// ---------- tests ----------

func TestLoginIssuesAccessTokenAndRefreshCookie(t *testing.T) {
	r, _, users, refresh, tokens := setupAuthRouter(t)
	user := seedUser(t, users)

	rec, cookie := login(t, r)

	body := decodeBody(t, rec)
	access, _ := body["access_token"].(string)
	if access == "" {
		t.Fatalf("missing access_token: %v", body)
	}
	if body["token"] != access {
		t.Error("legacy token field must mirror access_token")
	}
	if body["token_type"] != "Bearer" {
		t.Errorf("token_type = %v", body["token_type"])
	}
	if expires, _ := body["expires_in"].(float64); expires != 900 {
		t.Errorf("expires_in = %v, want 900", body["expires_in"])
	}

	claims, err := tokens.Parse(access)
	if err != nil {
		t.Fatalf("access token should be valid: %v", err)
	}
	if claims.UserID != user.ID.String() {
		t.Errorf("token user = %q, want %q", claims.UserID, user.ID)
	}

	if !cookie.HttpOnly {
		t.Error("refresh cookie must be HttpOnly")
	}
	if cookie.Secure {
		t.Error("refresh cookie should not be Secure in local HTTP mode")
	}
	if cookie.Path != refreshCookiePath {
		t.Errorf("cookie path = %q, want %q", cookie.Path, refreshCookiePath)
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie SameSite = %v, want Lax", cookie.SameSite)
	}
	if cookie.MaxAge != int((30 * 24 * time.Hour).Seconds()) {
		t.Errorf("cookie MaxAge = %d", cookie.MaxAge)
	}

	records := refresh.all()
	if len(records) != 1 {
		t.Fatalf("expected 1 refresh record, got %d", len(records))
	}
	record := records[0]
	if record.UserID != user.ID {
		t.Errorf("record user = %s", record.UserID)
	}
	if record.TokenHash == cookie.Value {
		t.Error("refresh token must not be stored in plaintext")
	}
	if record.TokenHash != security.HashRefreshToken(cookie.Value) {
		t.Error("stored hash does not match cookie value")
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	r, _, users, refresh, _ := setupAuthRouter(t)
	seedUser(t, users)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email":    "user@example.com",
		"password": "wrong-password",
	}, nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if len(refresh.all()) != 0 {
		t.Error("no refresh token should be created on failed login")
	}
}

func TestRegisterEnforcesPasswordPolicy(t *testing.T) {
	r, _, _, refresh, _ := setupAuthRouter(t)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email":    "new@example.com",
		"password": "short",
		"name":     "New User",
	}, nil, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if len(refresh.all()) != 0 {
		t.Error("no session should be created for invalid registration")
	}
}

func TestRegisterCreatesSession(t *testing.T) {
	r, _, _, refresh, tokens := setupAuthRouter(t)

	password := strings.Repeat("p", 8)
	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email":    "new@example.com",
		"password": password,
		"name":     "New User",
	}, nil, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	cookie := findCookie(t, rec, refreshCookieName)
	if cookie == nil {
		t.Fatal("registration must set refresh cookie")
	}
	if len(refresh.all()) != 1 {
		t.Errorf("expected 1 refresh record, got %d", len(refresh.all()))
	}

	body := decodeBody(t, rec)
	access, _ := body["access_token"].(string)
	if _, err := tokens.Parse(access); err != nil {
		t.Fatalf("access token invalid: %v", err)
	}
}

func TestRefreshRotatesToken(t *testing.T) {
	r, _, users, refresh, _ := setupAuthRouter(t)
	user := seedUser(t, users)

	_, firstCookie := login(t, r)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{firstCookie}, map[string]string{
		refreshRequestHeader: "XMLHttpRequest",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh status = %d, body = %s", rec.Code, rec.Body.String())
	}
	secondCookie := findCookie(t, rec, refreshCookieName)
	if secondCookie == nil {
		t.Fatal("refresh response missing new cookie")
	}
	if secondCookie.Value == firstCookie.Value {
		t.Fatal("refresh token was not rotated")
	}
	if body := decodeBody(t, rec); body["access_token"] == nil {
		t.Fatalf("refresh response missing access token: %v", body)
	}

	if active := refresh.activeCount(user.ID); active != 1 {
		t.Errorf("active refresh tokens = %d, want 1", active)
	}

	old, err := refresh.FindByHash(context.Background(), security.HashRefreshToken(firstCookie.Value))
	if err != nil {
		t.Fatalf("old record missing: %v", err)
	}
	if old.RevokedAt == nil {
		t.Error("old refresh token must be revoked after rotation")
	}
}

func TestRefreshDetectsReplayAndRevokesAllSessions(t *testing.T) {
	r, _, users, refresh, _ := setupAuthRouter(t)
	user := seedUser(t, users)

	_, firstCookie := login(t, r)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{firstCookie}, map[string]string{
		refreshRequestHeader: "XMLHttpRequest",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh status = %d", rec.Code)
	}
	secondCookie := findCookie(t, rec, refreshCookieName)
	if secondCookie == nil {
		t.Fatal("missing rotated cookie")
	}

	// 重放已撤销的旧令牌
	replay := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{firstCookie}, map[string]string{
		refreshRequestHeader: "XMLHttpRequest",
	})
	if replay.Code != http.StatusUnauthorized {
		t.Fatalf("replay status = %d, want 401", replay.Code)
	}
	if active := refresh.activeCount(user.ID); active != 0 {
		t.Errorf("all sessions must be revoked after replay, active = %d", active)
	}
	if cookie := findCookie(t, replay, refreshCookieName); cookie == nil || cookie.MaxAge >= 0 {
		t.Error("replay response must clear the refresh cookie")
	}

	// 新令牌也已被全量撤销
	after := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{secondCookie}, map[string]string{
		refreshRequestHeader: "XMLHttpRequest",
	})
	if after.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 after all sessions revoked", after.Code)
	}
}

func TestRefreshRequiresCustomHeader(t *testing.T) {
	r, _, users, refresh, _ := setupAuthRouter(t)
	user := seedUser(t, users)

	_, cookie := login(t, r)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{cookie}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if active := refresh.activeCount(user.ID); active != 1 {
		t.Error("token must not be rotated when the CSRF header is missing")
	}
}

func TestRefreshWithoutCookie(t *testing.T) {
	r, _, users, _, _ := setupAuthRouter(t)
	seedUser(t, users)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/refresh", nil, nil, map[string]string{
		refreshRequestHeader: "XMLHttpRequest",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestLogoutRevokesTokenAndClearsCookie(t *testing.T) {
	r, _, users, refresh, _ := setupAuthRouter(t)
	user := seedUser(t, users)

	_, cookie := login(t, r)

	rec := doJSON(t, r, http.MethodPost, "/api/v1/auth/logout", nil, []*http.Cookie{cookie}, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d, want 204", rec.Code)
	}
	cleared := findCookie(t, rec, refreshCookieName)
	if cleared == nil || cleared.MaxAge >= 0 {
		t.Error("logout must expire the refresh cookie")
	}
	if active := refresh.activeCount(user.ID); active != 0 {
		t.Errorf("refresh token still active after logout: %d", active)
	}

	// 重复登出保持幂等
	rec = doJSON(t, r, http.MethodPost, "/api/v1/auth/logout", nil, []*http.Cookie{cookie}, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("second logout status = %d, want 204", rec.Code)
	}
}
