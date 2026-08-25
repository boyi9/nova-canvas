package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
)

type FissionVariant struct {
	Index  int    `json:"index"`
	Hook   string `json:"hook"`
	Rhythm string `json:"rhythm"`
	Shot   string `json:"shot"`
	Copy   string `json:"copy"`
}

var (
	fissionHooks   = []string{"开头抛悬念", "直接上利益点", "用户证言切入", "反常识开场", "热点借势"}
	fissionRhythms = []string{"快节奏卡点", "前3秒黄金钩子", "慢铺垫后爆发", "分镜交替加速"}
	fissionShots   = []string{"特写产品", "使用场景", "对比前后", "达人出镜", "字幕强调"}
)

// decomposeFission breaks a reference into shots/rhythm/hooks and produces N
// deterministic variants (no external model needed — pure templated fission).
func decomposeFission(reference string, count int) []FissionVariant {
	variants := make([]FissionVariant, 0, count)
	for i := 0; i < count; i++ {
		hook := fissionHooks[i%len(fissionHooks)]
		rhythm := fissionRhythms[i%len(fissionRhythms)]
		shot := fissionShots[i%len(fissionShots)]
		variants = append(variants, FissionVariant{
			Index:  i + 1,
			Hook:   hook,
			Rhythm: rhythm,
			Shot:   shot,
			Copy:   fmt.Sprintf("【变体%d】%s｜%s｜%s（素材：%s）", i+1, hook, shot, rhythm, reference),
		})
	}
	return variants
}

// GenerateFission decomposes a reference ("爆款") into shots/rhythm/hooks and
// produces N fission variants for batch creation.
func (h *Handler) GenerateFission(c *gin.Context) {
	var req struct {
		Reference string `json:"reference" binding:"required"`
		Count     int    `json:"count"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Count <= 0 {
		req.Count = 10
	}
	if req.Count > 100 {
		req.Count = 100
	}

	variants := decomposeFission(req.Reference, req.Count)
	c.JSON(http.StatusOK, gin.H{
		"id":        uuid.New().String(),
		"status":    "success",
		"reference": req.Reference,
		"count":     len(variants),
		"variants":  variants,
	})
}
