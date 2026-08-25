package handlers

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

// BatchGenerateImages generates N hero-image variants for an e-commerce product.
// When no image API key is configured it returns deterministic mock data-URI
// images so the flow is demonstrable and testable offline.
func (h *Handler) BatchGenerateImages(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
		Count  int    `json:"count"`
		Style  string `json:"style"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Count <= 0 {
		req.Count = 4
	}
	if req.Count > 20 {
		req.Count = 20
	}

	styleSuffix := map[string]string{
		"white":    "白底电商主图，高清，居中构图",
		"scene":    "生活化场景图，自然光，真实使用场景",
		"minimal":  "极简风格，留白，高级感",
		"promo":    "促销氛围，突出卖点，醒目配色",
	}

	images := make([]map[string]string, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		variant := req.Prompt
		if suffix, ok := styleSuffix[req.Style]; ok {
			variant += "，" + suffix
		}
		variant += fmt.Sprintf("（变体 %d/%d）", i+1, req.Count)

		url := ""
		model := ""
		result, err := aimodel.GenerateImage(c.Request.Context(), aimodel.ImageRequest{
			Prompt: variant,
			Width:  800,
			Height: 800,
			Style:  req.Style,
		})
		if err == nil && result != nil && result.URL != "" {
			url = result.URL
			if m, ok := result.Meta["model"].(string); ok {
				model = m
			}
		} else {
			url = mockImageDataURI(variant, "mock")
			model = "mock"
		}

		images = append(images, map[string]string{
			"id":     uuid.New().String(),
			"url":    url,
			"prompt": variant,
			"model":  model,
		})
	}

	c.JSON(http.StatusOK, gin.H{"images": images})
}

func mockImageDataURI(prompt, model string) string {
	safe := strings.ReplaceAll(prompt, "\"", "'")
	safe = strings.ReplaceAll(safe, "<", "(")
	safe = strings.ReplaceAll(safe, ">", ")")
	svg := fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e5e7eb"/><text x="16" y="36" font-size="16" fill="#111827">%s</text><text x="16" y="384" font-size="12" fill="#6b7280">%s</text></svg>`,
		safe, model,
	)
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}
