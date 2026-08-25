package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestListProviders(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	router := gin.New()
	router.GET("/ai/providers", h.ListProviders)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/ai/providers", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	providers, ok := body["providers"].([]interface{})
	assert.True(t, ok)
	assert.GreaterOrEqual(t, len(providers), 1)
}

func TestChatWithProviderMock(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	router := gin.New()
	router.POST("/ai/chat", h.ChatWithProvider)

	payload := `{"provider":"mock","messages":[{"role":"user","content":"你好"}]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ai/chat", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	assert.Contains(t, body["reply"].(string), "mock")
	assert.Equal(t, "mock", body["provider"])
}

func TestChatWithProviderDefaultsToMock(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	router := gin.New()
	router.POST("/ai/chat", h.ChatWithProvider)

	payload := `{"messages":[{"role":"user","content":"推荐主图"}]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ai/chat", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	assert.Contains(t, body["reply"].(string), "mock")
}
