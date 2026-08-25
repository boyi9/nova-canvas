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

func TestBatchGenerateImagesMock(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	router := gin.New()
	router.POST("/ai/batch-image", h.BatchGenerateImages)

	payload := `{"prompt":"精华水乳套装","count":3,"style":"white"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ai/batch-image", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	images, ok := body["images"].([]interface{})
	assert.True(t, ok)
	assert.Len(t, images, 3)
	first := images[0].(map[string]interface{})
	assert.Contains(t, first["url"].(string), "data:image/svg+xml;base64,")
	assert.Equal(t, "mock", first["model"])
}

func TestRunScriptInlineJS(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	router := gin.New()
	router.POST("/scripts/run", h.RunScriptInline)

	payload := `{"language":"javascript","source":"const x = 21; const result = { doubled: x * 2 }; console.log('done'); result;"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/scripts/run", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	assert.Equal(t, "success", body["status"])
	assert.Contains(t, body["output"].(string), "doubled")
}
