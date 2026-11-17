package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/models"
)

// fakeGenerationRepo 实现 GenerationRepository，用于越权用例。
type fakeGenerationRepo struct {
	gens map[string]*models.Generation // 按 TaskID 索引
}

func newFakeGenerationRepo() *fakeGenerationRepo {
	return &fakeGenerationRepo{gens: map[string]*models.Generation{}}
}

func (r *fakeGenerationRepo) Create(_ context.Context, gen *models.Generation) error {
	clone := *gen
	r.gens[gen.TaskID] = &clone
	return nil
}

func (r *fakeGenerationRepo) FindByID(_ context.Context, id uuid.UUID) (*models.Generation, error) {
	for _, gen := range r.gens {
		if gen.ID == id {
			clone := *gen
			return &clone, nil
		}
	}
	return nil, errFakeNotFound
}

func (r *fakeGenerationRepo) FindByTaskID(_ context.Context, taskID string) (*models.Generation, error) {
	if gen, ok := r.gens[taskID]; ok {
		clone := *gen
		return &clone, nil
	}
	return nil, errFakeNotFound
}

func (r *fakeGenerationRepo) UpdateStatus(_ context.Context, id uuid.UUID, status, resultURL, resultMeta, errMsg string) error {
	for _, gen := range r.gens {
		if gen.ID == id {
			gen.Status = status
			gen.ResultURL = resultURL
			return nil
		}
	}
	return errFakeNotFound
}

func (r *fakeGenerationRepo) ListByUser(_ context.Context, userID uuid.UUID, limit, offset int) ([]*models.Generation, int64, error) {
	return nil, 0, nil
}

func (r *fakeGenerationRepo) ListPending(_ context.Context, limit int) ([]*models.Generation, error) {
	return nil, nil
}

// mustUUID 解析测试用用户 ID；解析失败直接终止测试。
func mustUUID(t *testing.T, raw string) uuid.UUID {
	t.Helper()
	id, err := uuid.Parse(raw)
	if err != nil {
		t.Fatalf("parse uuid %q: %v", raw, err)
	}
	return id
}

// asUser 模拟 Auth 中间件注入的用户身份。
func asUser(userID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	}
}

func TestGetGenerationStatusEnforcesOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := newFakeGenerationRepo()
	h := NewHandler(nil, nil, repo, nil)

	ownerID := uuid.New().String()
	newRouter := func(userID string) *gin.Engine {
		r := gin.New()
		v1 := r.Group("/api/v1")
		v1.Use(asUser(userID))
		v1.GET("/generate/status/:task_id", h.GetGenerationStatus)
		return r
	}
	ownerRouter := newRouter(ownerID)
	attackerRouter := newRouter("someone-else")

	gen := &models.Generation{
		ID:     uuid.New(),
		UserID: mustUUID(t, ownerID),
		Type:   "image",
		Status: "succeeded",
		TaskID: "task-123",
	}
	if err := repo.Create(context.Background(), gen); err != nil {
		t.Fatalf("seed generation: %v", err)
	}

	// 归属用户可查询
	rec := httptest.NewRecorder()
	ownerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/generate/status/task-123", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("owner status = %d, body = %s", rec.Code, rec.Body.String())
	}

	// 其他用户查询同一任务：404，不泄露存在性与结果 URL
	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/generate/status/task-123", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("attacker status = %d, want 404", rec.Code)
	}
	if body := rec.Body.String(); containsSubstring(body, "result_url") {
		t.Fatalf("attacker response leaks result url: %s", body)
	}
}

func TestRecipeStoreEnforcesOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil, nil, nil, nil)

	newRouter := func(userID string) *gin.Engine {
		r := gin.New()
		r.Use(asUser(userID))
		v1 := r.Group("/api/v1")
		v1.POST("/recipes", h.SaveRecipe)
		v1.GET("/recipes", h.ListRecipes)
		v1.GET("/recipes/:id", h.GetRecipe)
		return r
	}
	ownerRouter := newRouter("owner-" + uuid.New().String())
	attackerRouter := newRouter("attacker-" + uuid.New().String())

	body := mustJSON(map[string]any{"name": "private-recipe"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/recipes", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	ownerRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("save status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var saved struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &saved); err != nil || saved.ID == "" {
		t.Fatalf("decode saved id: %v", err)
	}

	// 攻击者列表看不到他人配方
	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/recipes", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d", rec.Code)
	}
	var listed struct {
		Recipes []map[string]any `json:"recipes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listed.Recipes) != 0 {
		t.Fatalf("attacker can see %d foreign recipes", len(listed.Recipes))
	}

	// 攻击者按 ID 读取：404
	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/recipes/"+saved.ID, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("attacker get status = %d, want 404", rec.Code)
	}

	// 归属用户仍可读取
	rec = httptest.NewRecorder()
	ownerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/recipes/"+saved.ID, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("owner get status = %d", rec.Code)
	}
}

func TestScriptStoreEnforcesOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil, nil, nil, nil)

	newRouter := func(userID string) *gin.Engine {
		r := gin.New()
		r.Use(asUser(userID))
		v1 := r.Group("/api/v1")
		v1.GET("/scripts", h.ListScripts)
		v1.GET("/scripts/:id", h.GetScript)
		v1.POST("/scripts/:id/run", h.RunScript)
		return r
	}
	// 用 SaveScript 建数据（走与生产一致的路径）
	saveRouter := gin.New()
	saveRouter.Use(asUser("script-owner"))
	v1 := saveRouter.Group("/api/v1")
	v1.POST("/scripts", h.SaveScript)

	scriptBody := mustJSON(map[string]any{
		"name": "private-script",
		"config": map[string]any{
			"language": "javascript",
			"source":   "return 1",
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/scripts", bytes.NewReader(scriptBody))
	rec := httptest.NewRecorder()
	saveRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("save status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var saved scriptDef
	if err := json.Unmarshal(rec.Body.Bytes(), &saved); err != nil || saved.ID == "" {
		t.Fatalf("decode saved script: %v", err)
	}

	attackerRouter := newRouter("script-attacker")

	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/scripts", nil))
	var listed struct {
		Scripts []scriptDef `json:"scripts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listed.Scripts) != 0 {
		t.Fatalf("attacker can see %d foreign scripts", len(listed.Scripts))
	}

	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/scripts/"+saved.ID, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("attacker get status = %d, want 404", rec.Code)
	}

	// 运行同样受归属限制
	rec = httptest.NewRecorder()
	attackerRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/scripts/"+saved.ID+"/run", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("attacker run status = %d, want 404", rec.Code)
	}
}
