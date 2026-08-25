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
	"nova-canvas-backend/internal/script"
)

// scriptStore is a simple JSON-file-backed store for saved custom scripts. It is a
// package-level singleton for the MVP; swapping in a database later only requires
// changing this type.
type scriptStore struct {
	mu      sync.RWMutex
	scripts map[string]scriptDef
	path    string
}

type scriptDef struct {
	ID     string             `json:"id"`
	Name   string             `json:"name"`
	Config script.ScriptConfig `json:"config"`
}

var globalScriptStore = newScriptStore()

func newScriptStore() *scriptStore {
	dir, _ := os.Getwd()
	path := filepath.Join(dir, "data", "scripts.json")
	ss := &scriptStore{scripts: map[string]scriptDef{}, path: path}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &ss.scripts)
	}
	return ss
}

func (s *scriptStore) persist() {
	s.mu.RLock()
	data, _ := json.MarshalIndent(s.scripts, "", "  ")
	s.mu.RUnlock()
	_ = os.MkdirAll(filepath.Dir(s.path), 0o755)
	_ = os.WriteFile(s.path, data, 0o644)
}

func (h *Handler) SaveScript(c *gin.Context) {
	var req scriptDef
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}
	if req.Name == "" {
		errs.RespondError(c, errs.ErrBadRequest("script name is required"))
		return
	}
	if req.Config.Language == "" {
		req.Config.Language = "javascript"
	}
	if req.Config.Limits.MaxExecutionTime == 0 {
		req.Config.Limits = script.DefaultResourceLimits()
	}
	id := uuid.New().String()
	req.ID = id

	globalScriptStore.mu.Lock()
	globalScriptStore.scripts[id] = req
	globalScriptStore.mu.Unlock()
	globalScriptStore.persist()

	c.JSON(http.StatusCreated, req)
}

func (h *Handler) ListScripts(c *gin.Context) {
	globalScriptStore.mu.RLock()
	list := make([]scriptDef, 0, len(globalScriptStore.scripts))
	for _, s := range globalScriptStore.scripts {
		list = append(list, s)
	}
	globalScriptStore.mu.RUnlock()
	c.JSON(http.StatusOK, gin.H{"scripts": list})
}

func (h *Handler) GetScript(c *gin.Context) {
	id := c.Param("id")
	globalScriptStore.mu.RLock()
	s, ok := globalScriptStore.scripts[id]
	globalScriptStore.mu.RUnlock()
	if !ok {
		errs.RespondError(c, errs.ErrNotFound("script not found"))
		return
	}
	c.JSON(http.StatusOK, s)
}

// RunScript executes a saved custom script inside the sandbox and returns the
// execution result. JS scripts run in-process via Goja (no external binary).
func (h *Handler) RunScript(c *gin.Context) {
	id := c.Param("id")
	globalScriptStore.mu.RLock()
	s, ok := globalScriptStore.scripts[id]
	globalScriptStore.mu.RUnlock()
	if !ok {
		errs.RespondError(c, errs.ErrNotFound("script not found"))
		return
	}

	result, err := script.NewGojaSandbox().Execute(c.Request.Context(), s.Config, nil)
	if err != nil && result == nil {
		errs.RespondError(c, errs.ErrModelUnavailable("script execution failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, result)
}

// RunScriptInline executes an ad-hoc script config without persisting it.
func (h *Handler) RunScriptInline(c *gin.Context) {
	var config script.ScriptConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}
	if config.Language == "" {
		config.Language = "javascript"
	}
	if config.Limits.MaxExecutionTime == 0 {
		config.Limits = script.DefaultResourceLimits()
	}

	result, err := script.NewGojaSandbox().Execute(c.Request.Context(), config, nil)
	if err != nil && result == nil {
		errs.RespondError(c, errs.ErrModelUnavailable("script execution failed: "+err.Error()))
		return
	}
	c.JSON(http.StatusOK, result)
}
