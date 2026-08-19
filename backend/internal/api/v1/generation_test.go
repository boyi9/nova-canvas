package v1

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nova-canvas/backend/internal/model"
	"nova-canvas/backend/internal/service"
	"nova-canvas/backend/internal/service/mocks"
	"nova-canvas/backend/pkg/errno"
	"nova-canvas/backend/pkg/response"
)

func setupTestHandler(t *testing.T) (*GenerationHandler, *mocks.MockGenerationService, *gin.Engine) {
	ctrl := gomock.NewController(t)
	mockSvc := mocks.NewMockGenerationService(ctrl)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Recovery())

	handler := NewGenerationHandler(nil, mockSvc)
	handler.RegisterRoutes(router.Group("/api/v1"))

	return handler, mockSvc, router
}

func performRequest(router http.Handler, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}

	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestCreateGeneration_Success(t *testing.T) {
	handler, mockSvc, router := setupTestHandler(t)

	reqBody := CreateGenerationRequest{
		Prompt:         "A beautiful sunset",
		Model:          "seedream-5.0",
		NodeType:       "generation",
		ReferenceNodeIDs: []string{"550e8400-e29b-41d4-a716-446655440000"},
		InsertPosition: &Position{X: 100, Y: 200},
	}

	expectedResp := &CreateGenerationResponse{
		TaskID: "550e8400-e29b-41d4-a716-446655440001",
	}

	mockSvc.EXPECT().
		CreateGeneration(gomock.Any(), uint64(123), gomock.Any()).
		Return(expectedResp, nil)

	// 模拟中间件注入 userID
	w := performRequest(router, "POST", "/api/v1/generations", reqBody, "valid-token")
	// 注入 userID 到 context（实际由中间件完成，这里手动模拟）
	// 在真实测试中应使用中间件或手动设置 context

	assert.Equal(t, http.StatusOK, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, expectedResp.TaskID, resp.Data.(map[string]interface{})["task_id"])
}

func TestCreateGeneration_InvalidParam(t *testing.T) {
	_, _, router := setupTestHandler(t)

	// 缺少必填字段 prompt
	reqBody := CreateGenerationRequest{
		Model:    "seedream-5.0",
		NodeType: "generation",
	}

	w := performRequest(router, "POST", "/api/v1/generations", reqBody, "valid-token")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, errno.ErrInvalidParam.Code, resp.Code)
}

func TestCreateGeneration_InvalidModel(t *testing.T) {
	_, _, router := setupTestHandler(t)

	reqBody := CreateGenerationRequest{
		Prompt:   "test",
		Model:    "invalid-model",
		NodeType: "generation",
	}

	w := performRequest(router, "POST", "/api/v1/generations", reqBody, "valid-token")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
}

func TestGetGeneration_Success(t *testing.T) {
	handler, mockSvc, router := setupTestHandler(t)

	taskID := "550e8400-e29b-41d4-a716-446655440000"
	expectedResp := &GetGenerationResponse{
		TaskID:    taskID,
		Status:    "succeeded",
		Progress:  100,
		ResultURL: "https://example.com/result.png",
		CreatedAt: 1699999999,
		UpdatedAt: 1700000000,
	}

	mockSvc.EXPECT().
		GetGeneration(gomock.Any(), uint64(123), taskID).
		Return(expectedResp, nil)

	w := performRequest(router, "GET", "/api/v1/generations/"+taskID, nil, "valid-token")

	assert.Equal(t, http.StatusOK, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, taskID, resp.Data.(map[string]interface{})["task_id"])
}

func TestGetGeneration_NotFound(t *testing.T) {
	_, mockSvc, router := setupTestHandler(t)

	taskID := "550e8400-e29b-41d4-a716-446655440000"

	mockSvc.EXPECT().
		GetGeneration(gomock.Any(), uint64(123), taskID).
		Return(nil, errno.ErrNotFound.WithMessage("generation task not found"))

	w := performRequest(router, "GET", "/api/v1/generations/"+taskID, nil, "valid-token")

	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, errno.ErrNotFound.Code, resp.Code)
}

func TestListGenerations_Success(t *testing.T) {
	_, mockSvc, router := setupTestHandler(t)

	expectedResp := &ListGenerationsResponse{
		Total: 2,
		List: []GetGenerationResponse{
			{TaskID: "550e8400-e29b-41d4-a716-446655440001", Status: "succeeded", Progress: 100, ResultURL: "https://example.com/1.png"},
			{TaskID: "550e8400-e29b-41d4-a716-446655440002", Status: "running", Progress: 50},
		},
	}

	mockSvc.EXPECT().
		ListGenerations(gomock.Any(), uint64(123), gomock.Any()).
		Return(expectedResp, nil)

	w := performRequest(router, "GET", "/api/v1/generations?page=1&page_size=10&status=succeeded", nil, "valid-token")

	assert.Equal(t, http.StatusOK, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, float64(2), resp.Data.(map[string]interface{})["total"])
}

func TestCancelGeneration_Success(t *testing.T) {
	_, mockSvc, router := setupTestHandler(t)

	taskID := "550e8400-e29b-41d4-a716-446655440000"

	mockSvc.EXPECT().
		CancelGeneration(gomock.Any(), uint64(123), taskID).
		Return(nil)

	w := performRequest(router, "POST", "/api/v1/generations/"+taskID+"/cancel", nil, "valid-token")

	assert.Equal(t, http.StatusOK, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestCancelGeneration_InvalidStatus(t *testing.T) {
	_, mockSvc, router := setupTestHandler(t)

	taskID := "550e8400-e29b-41d4-a716-446655440000"

	mockSvc.EXPECT().
		CancelGeneration(gomock.Any(), uint64(123), taskID).
		Return(errno.ErrInvalidState.WithMessage("task cannot be cancelled"))

	w := performRequest(router, "POST", "/api/v1/generations/"+taskID+"/cancel", nil, "valid-token")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, errno.ErrInvalidState.Code, resp.Code)
}

// BenchmarkCreateGeneration 基准测试
func BenchmarkCreateGeneration(b *testing.B) {
	handler, mockSvc, router := setupTestHandler(b)

	reqBody := CreateGenerationRequest{
		Prompt:    "benchmark test",
		Model:     "seedream-5.0",
		NodeType:  "generation",
	}

	mockSvc.EXPECT().
		CreateGeneration(gomock.Any(), gomock.Any(), gomock.Any()).
		Return(&CreateGenerationResponse{TaskID: "test"}, nil).
		AnyTimes()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := performRequest(router, "POST", "/api/v1/generations", reqBody, "token")
		if w.Code != http.StatusOK {
			b.Fatalf("unexpected status: %d", w.Code)
		}
	}
}