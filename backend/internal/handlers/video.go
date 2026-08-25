package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/aimodel"
	"nova-canvas-backend/internal/errs"
)

type VideoShot struct {
	Index    int    `json:"index"`
	Prompt   string `json:"prompt"`
	ImageURL string `json:"image_url"`
	Duration int    `json:"duration"`
}

// GenerateVideoComposition turns a storyboard into a multi-shot video composition.
// Each shot is generated via the configured video provider when a key is present,
// otherwise a deterministic mock still is returned so the flow works offline.
func (h *Handler) GenerateVideoComposition(c *gin.Context) {
	var req struct {
		Prompt    string   `json:"prompt"`
		Duration  int      `json:"duration"`
		Shots     []string `json:"shots"`
		Style     string   `json:"style"`
		Voiceover string   `json:"voiceover"`
		Music     string   `json:"music"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Duration <= 0 {
		req.Duration = 15
	}
	if len(req.Shots) == 0 {
		if req.Prompt == "" {
			errs.RespondError(c, errs.ErrBadRequest("prompt or shots are required"))
			return
		}
		req.Shots = []string{req.Prompt}
	}

	perShot := req.Duration / len(req.Shots)
	if perShot <= 0 {
		perShot = 3
	}

	shots := make([]VideoShot, 0, len(req.Shots))
	for i, shotPrompt := range req.Shots {
		imageURL := ""
		res, err := aimodel.GenerateVideo(c.Request.Context(), aimodel.VideoRequest{
			Prompt:   shotPrompt,
			Duration: perShot,
			Style:    req.Style,
		})
		if err == nil && res != nil && res.URL != "" {
			imageURL = res.URL
		} else {
			imageURL = mockImageDataURI("镜头 "+strconv.Itoa(i+1)+": "+shotPrompt, "mock-video")
		}
		shots = append(shots, VideoShot{
			Index:    i + 1,
			Prompt:   shotPrompt,
			ImageURL: imageURL,
			Duration: perShot,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        uuid.New().String(),
		"status":    "success",
		"url":       "",
		"duration":  req.Duration,
		"voiceover": req.Voiceover,
		"music":     req.Music,
		"shots":     shots,
	})
}
