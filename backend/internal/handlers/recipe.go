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
type recipeStore struct {
	mu      sync.RWMutex
	recipes map[string]workflow.Recipe
	path    string
}

var globalRecipeStore = newRecipeStore()

func newRecipeStore() *recipeStore {
	dir, _ := os.Getwd()
	path := filepath.Join(dir, "data", "recipes.json")
	rs := &recipeStore{recipes: map[string]workflow.Recipe{}, path: path}
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
	globalRecipeStore.recipes[id] = req
	globalRecipeStore.mu.Unlock()
	globalRecipeStore.persist()

	c.JSON(http.StatusCreated, req)
}

func (h *Handler) ListRecipes(c *gin.Context) {
	globalRecipeStore.mu.RLock()
	list := make([]workflow.Recipe, 0, len(globalRecipeStore.recipes))
	for _, r := range globalRecipeStore.recipes {
		list = append(list, r)
	}
	globalRecipeStore.mu.RUnlock()
	c.JSON(http.StatusOK, gin.H{"recipes": list})
}

func (h *Handler) GetRecipe(c *gin.Context) {
	id := c.Param("id")
	globalRecipeStore.mu.RLock()
	r, ok := globalRecipeStore.recipes[id]
	globalRecipeStore.mu.RUnlock()
	if !ok {
		errs.RespondError(c, errs.ErrNotFound("recipe not found"))
		return
	}
	c.JSON(http.StatusOK, r)
}

// ApplyRecipe instantiates the saved recipe with the supplied variable values
// and returns the concrete node graph for the client to drop onto the canvas.
func (h *Handler) ApplyRecipe(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Values map[string]any `json:"values"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	globalRecipeStore.mu.RLock()
	r, ok := globalRecipeStore.recipes[id]
	globalRecipeStore.mu.RUnlock()
	if !ok {
		errs.RespondError(c, errs.ErrNotFound("recipe not found"))
		return
	}

	graph := r.Instantiate(req.Values)
	c.JSON(http.StatusOK, gin.H{"graph": graph})
}
