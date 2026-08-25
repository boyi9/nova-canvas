package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
)

type AdScene struct {
	Shot      int    `json:"shot"`
	Visual    string `json:"visual"`
	Voiceover string `json:"voiceover"`
	Duration  int    `json:"duration"`
}

var adVisuals = map[string][]string{
	"tvc":      {"品牌大气开场", "产品特写", "使用场景", "用户证言", "Logo 定格"},
	"social":   {"第一视角开箱", "痛点直击", "产品演示", "种草口播", "引导下单"},
	"festival": {"节日氛围铺陈", "礼盒特写", "团聚场景", "优惠信息", "限时召唤"},
}

var adVoiceovers = []string{
	"这一刻，值得被看见。",
	"不止好用，更懂生活。",
	"把心意，交给更懂你的人。",
	"现在下单，惊喜即刻启程。",
}

// generateAdScript builds a deterministic TVC/social/festival storyboard from a brief.
func generateAdScript(brief, style string, duration int) []AdScene {
	visuals, ok := adVisuals[style]
	if !ok {
		visuals = adVisuals["tvc"]
	}
	if duration <= 0 {
		duration = 15
	}
	count := 3
	if duration >= 60 {
		count = 5
	} else if duration >= 30 {
		count = 4
	}
	perShot := duration / count
	if perShot <= 0 {
		perShot = 3
	}

	scenes := make([]AdScene, 0, count)
	for i := 0; i < count; i++ {
		visual := visuals[i%len(visuals)]
		voice := adVoiceovers[i%len(adVoiceovers)]
		scenes = append(scenes, AdScene{
			Shot:      i + 1,
			Visual:    fmt.Sprintf("%s（素材：%s）", visual, brief),
			Voiceover: voice,
			Duration:  perShot,
		})
	}
	return scenes
}

// GenerateAdScript turns an ad brief into a storyboard (scenes with visual + voiceover).
func (h *Handler) GenerateAdScript(c *gin.Context) {
	var req struct {
		Brief    string `json:"brief" binding:"required"`
		Style    string `json:"style"`
		Duration int    `json:"duration"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}
	if req.Duration <= 0 {
		req.Duration = 15
	}
	scenes := generateAdScript(req.Brief, req.Style, req.Duration)
	c.JSON(http.StatusOK, gin.H{
		"id":      uuid.New().String(),
		"status":  "success",
		"brief":   req.Brief,
		"style":   req.Style,
		"scenes":  scenes,
	})
}

type DramaEpisode struct {
	Index   int      `json:"index"`
	Title   string   `json:"title"`
	Outline string   `json:"outline"`
	Scenes  []string `json:"scenes"`
}

// generateDrama breaks a synopsis into characters and a multi-episode outline.
func generateDrama(synopsis string, episodes int) (characters []string, result []DramaEpisode) {
	if episodes <= 0 {
		episodes = 3
	}
	characters = []string{"主角·阿岚", "对手·周野", "盟友·小满"}
	outlineTpl := []string{
		"铺垫：平静生活被打破，悬念埋下。",
		"转折：秘密浮出水面，关系重组。",
		"高潮：抉择与对抗，真相揭晓。",
		"余波：新的平衡，留白续集。",
	}
	for i := 0; i < episodes; i++ {
		outline := outlineTpl[i%len(outlineTpl)]
		result = append(result, DramaEpisode{
			Index:   i + 1,
			Title:   fmt.Sprintf("第%d集", i+1),
			Outline: outline,
			Scenes: []string{
				fmt.Sprintf("场景A：%s（素材：%s）", outline, synopsis),
				fmt.Sprintf("场景B：人物对峙，情绪升级"),
				fmt.Sprintf("场景C：悬念收束，引出下集"),
			},
		})
	}
	return characters, result
}

// GenerateDrama parses a synopsis into characters and a multi-episode breakdown.
func (h *Handler) GenerateDrama(c *gin.Context) {
	var req struct {
		Synopsis  string `json:"synopsis" binding:"required"`
		Episodes  int    `json:"episodes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}
	characters, episodes := generateDrama(req.Synopsis, req.Episodes)
	c.JSON(http.StatusOK, gin.H{
		"id":         uuid.New().String(),
		"status":     "success",
		"synopsis":   req.Synopsis,
		"characters": characters,
		"episodes":   episodes,
	})
}
