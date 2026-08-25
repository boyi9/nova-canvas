package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"nova-canvas-backend/internal/aimodel"
	"nova-canvas-backend/internal/errs"
)

// ListProviders returns the configured OpenAI-compatible providers (without keys).
func (h *Handler) ListProviders(c *gin.Context) {
	providers := aimodel.Registry().List()
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

// ChatWithProvider routes a chat request to the resolved OpenAI-compatible
// provider (requested id, default chat provider, or the offline mock).
func (h *Handler) ChatWithProvider(c *gin.Context) {
	var req struct {
		Provider string                   `json:"provider"`
		Scene    string                   `json:"scene"`
		Messages []aimodel.DeepSeekMessage `json:"messages" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	reply, providerID, err := aimodel.Registry().Chat(c.Request.Context(), req.Provider, req.Messages)
	if err != nil {
		errs.RespondError(c, errs.ErrModelUnavailable("model error: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reply":    reply,
		"provider": providerID,
	})
}
