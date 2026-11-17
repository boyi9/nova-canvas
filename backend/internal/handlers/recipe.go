package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/workflow"
)

// recipeStore is a simple JSON-file-backed store for saved recipes. It is a
// package-level singleton for the MVP; swapping in a database later only
// requires changing this type.
// recipeRecord 在配方之上记录归属用户：存储虽是文件级 MVP，
// 访问必须按用户隔离，任何已登录用户只能看到自己的配方。
type recipeRecord struct {
	Owner  string          `json:"owner"`
	Recipe workflow.Recipe `json:"recipe"`
}

type recipeStore struct {
	mu      sync.RWMutex
	recipes map[string]recipeRecord
	path    string
}

var globalRecipeStore = newRecipeStore()

func newRecipeStore() *recipeStore {
	dir, _ := os.Getwd()
	path := filepath.Join(dir, "data", "recipes.json")
	rs := &recipeStore{recipes: map[string]recipeRecord{}, path: path}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &rs.recipes)
	}
	return rs
}

func (s *recipeStore) persist() {
	s.mu.RLock()
	data, _ := json.MarshalIndent(s.recipes, "", "  ")
	s.mu.RUnlock()
	_ = os.MkdirAll(filepath.Dir(s.path), 0o755)
	_ = os.WriteFile(s.path, data, 0o644)
}

func (h *Handler) SaveRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		errs.RespondError(c, errs.ErrUnauthorized("authentication required"))
		return
	}
	var req workflow.Recipe
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}
	if req.Name == "" {
		errs.RespondError(c, errs.ErrBadRequest("recipe name is required"))
		return
	}
	id := uuid.New().String()
	req.ID = id

	globalRecipeStore.mu.Lock()
	globalRecipeStore.recipes[id] = recipeRecord{Owner: userID, Recipe: req}
	globalRecipeStore.mu.Unlock()
	globalRecipeStore.persist()

	c.JSON(http.StatusCreated, req)
}

func (h *Handler) ListRecipes(c *gin.Context) {
	userID := c.GetString("user_id")
	globalRecipeStore.mu.RLock()
	list := make([]workflow.Recipe, 0, len(globalRecipeStore.recipes))
	for _, record := range globalRecipeStore.recipes {
		if record.Owner == userID {
			list = append(list, record.Recipe)
		}
	}
	globalRecipeStore.mu.RUnlock()
	c.JSON(http.StatusOK, gin.H{"recipes": list})
}

func (h *Handler) GetRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")
	globalRecipeStore.mu.RLock()
	record, ok := globalRecipeStore.recipes[id]
	globalRecipeStore.mu.RUnlock()
	// 归属校验：他人的配方按 404 处理，不泄露存在性
	if !ok || record.Owner != userID {
		errs.RespondError(c, errs.ErrNotFound("recipe not found"))
		return
	}
	c.JSON(http.StatusOK, record.Recipe)
}

// ApplyRecipe instantiates the saved recipe with the supplied variable values
// and returns the concrete node graph for the client to drop onto the canvas.
func (h *Handler) ApplyRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")
	var req struct {
		Values map[string]any `json:"values"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	globalRecipeStore.mu.RLock()
	record, ok := globalRecipeStore.recipes[id]
	globalRecipeStore.mu.RUnlock()
	if !ok || record.Owner != userID {
		errs.RespondError(c, errs.ErrNotFound("recipe not found"))
		return
	}

	graph := record.Recipe.Instantiate(req.Values)
	c.JSON(http.StatusOK, gin.H{"graph": graph})
}
