package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"nova-canvas-backend/internal/aimodel"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/middleware"
	"nova-canvas-backend/internal/models"
	"nova-canvas-backend/internal/repository"
)

type Handler struct {
	Users      repository.UserRepository
	Projects   repository.ProjectRepository
	Generations repository.GenerationRepository
	Templates  repository.TemplateRepository
}

func NewHandler(u repository.UserRepository, p repository.ProjectRepository, g repository.GenerationRepository, t repository.TemplateRepository) *Handler {
	return &Handler{Users: u, Projects: p, Generations: g, Templates: t}
}

func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
		Name     string `json:"name" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	existing, _ := h.Users.FindByEmail(c.Request.Context(), req.Email)
	if existing != nil {
		errs.RespondError(c, errs.ErrConflict("Email already registered"))
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to hash password"))
		return
	}

	user := &models.User{
		ID:      uuid.New(),
		Email:   req.Email,
		Password: string(hashed),
		Name:    req.Name,
		Plan:    "free",
		Credits: 100,
	}

	if err := h.Users.Create(c.Request.Context(), user); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to create user"))
		return
	}

	token, err := middleware.GenerateToken(user.ID.String(), user.Email)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to generate token"))
		return
	}

	c.JSON(http.StatusCreated, gin.H{"user": user, "token": token})
}

func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	user, err := h.Users.FindByEmail(c.Request.Context(), req.Email)
	if err != nil {
		errs.RespondError(c, errs.ErrUnauthorized("Invalid email or password"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		errs.RespondError(c, errs.ErrUnauthorized("Invalid email or password"))
		return
	}

	token, err := middleware.GenerateToken(user.ID.String(), user.Email)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to generate token"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
}

func (h *Handler) GetProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	user, err := h.Users.FindByID(c.Request.Context(), uid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("User not found"))
		return
	}
	c.JSON(http.StatusOK, user)
}

func (h *Handler) UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	user, err := h.Users.FindByID(c.Request.Context(), uid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("User not found"))
		return
	}

	var req struct {
		Name   string `json:"name"`
		Avatar string `json:"avatar"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Avatar != "" {
		user.Avatar = req.Avatar
	}

	if err := h.Users.Update(c.Request.Context(), user); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to update profile"))
		return
	}
	c.JSON(http.StatusOK, user)
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "nova-canvas-backend", "version": "1.0.0"})
}

func (h *Handler) ListProjects(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	projects, total, err := h.Projects.ListByUser(c.Request.Context(), uid, limit, offset)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to list projects"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"projects": projects, "total": total})
}

func (h *Handler) CreateProject(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Scene       string `json:"scene" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	project := &models.Project{
		ID:          uuid.New(),
		UserID:      uid,
		Name:        req.Name,
		Description: req.Description,
		Scene:       req.Scene,
		CanvasData:  "{}",
		Status:      "draft",
	}

	if err := h.Projects.Create(c.Request.Context(), project); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to create project"))
		return
	}

	c.JSON(http.StatusCreated, project)
}

func (h *Handler) GetProject(c *gin.Context) {
	userID := c.GetString("user_id")
	projectID := c.Param("id")
	pid, _ := uuid.Parse(projectID)

	project, err := h.Projects.FindByID(c.Request.Context(), pid)
	if err != nil || project.UserID.String() != userID {
		errs.RespondError(c, errs.ErrNotFound("Project not found"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *Handler) UpdateProject(c *gin.Context) {
	userID := c.GetString("user_id")
	projectID := c.Param("id")
	pid, _ := uuid.Parse(projectID)

	project, err := h.Projects.FindByID(c.Request.Context(), pid)
	if err != nil || project.UserID.String() != userID {
		errs.RespondError(c, errs.ErrNotFound("Project not found"))
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CanvasData  string `json:"canvas_data"`
		Status      string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Name != "" {
		project.Name = req.Name
	}
	if req.Description != "" {
		project.Description = req.Description
	}
	if req.CanvasData != "" {
		project.CanvasData = req.CanvasData
	}
	if req.Status != "" {
		project.Status = req.Status
	}

	if err := h.Projects.Update(c.Request.Context(), project); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to update project"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *Handler) DeleteProject(c *gin.Context) {
	userID := c.GetString("user_id")
	projectID := c.Param("id")
	pid, _ := uuid.Parse(projectID)

	project, err := h.Projects.FindByID(c.Request.Context(), pid)
	if err != nil || project.UserID.String() != userID {
		errs.RespondError(c, errs.ErrNotFound("Project not found"))
		return
	}

	if err := h.Projects.Delete(c.Request.Context(), pid); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to delete project"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Project deleted"})
}

func (h *Handler) GenerateImage(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	user, err := h.Users.FindByID(c.Request.Context(), uid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("User not found"))
		return
	}

	if user.Credits <= 0 {
		errs.RespondError(c, errs.ErrInsufficientCredits("No credits remaining"))
		return
	}

	var req struct {
		Prompt   string `json:"prompt" binding:"required"`
		Width    int    `json:"width"`
		Height   int    `json:"height"`
		Style    string `json:"style"`
		Plan     string `json:"plan"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	if req.Width == 0 { req.Width = 800 }
	if req.Height == 0 { req.Height = 800 }

	gen := &models.Generation{
		ID:          uuid.New(),
		UserID:      uid,
		Type:        "image",
		Prompt:      req.Prompt,
		Params:      `{"width":` + strconv.Itoa(req.Width) + `,"height":` + strconv.Itoa(req.Height) + `,"style":"` + req.Style + `"}`,
		Status:      "pending",
		CreditsCost: 1,
		TaskID:      uuid.New().String(),
	}

	if err := h.Generations.Create(c.Request.Context(), gen); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to create generation task"))
		return
	}

	newCredits, err := h.Users.UpdateCredits(c.Request.Context(), uid, -1)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to deduct credits"))
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"task_id": gen.TaskID,
		"status":  "pending",
		"credits": newCredits,
	})
}

func (h *Handler) GenerateVideo(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	user, err := h.Users.FindByID(c.Request.Context(), uid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("User not found"))
		return
	}

	if user.Credits < 10 {
		errs.RespondError(c, errs.ErrInsufficientCredits("Video generation requires 10 credits"))
		return
	}

	var req struct {
		Prompt   string `json:"prompt" binding:"required"`
		Duration int    `json:"duration"`
		Style    string `json:"style"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	gen := &models.Generation{
		ID:          uuid.New(),
		UserID:      uid,
		Type:        "video",
		Prompt:      req.Prompt,
		Params:      `{"duration":` + strconv.Itoa(req.Duration) + `,"style":"` + req.Style + `"}`,
		Status:      "pending",
		CreditsCost: 10,
		TaskID:      uuid.New().String(),
	}

	if err := h.Generations.Create(c.Request.Context(), gen); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to create generation task"))
		return
	}

	newCredits, err := h.Users.UpdateCredits(c.Request.Context(), uid, -10)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to deduct credits"))
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"task_id": gen.TaskID,
		"status":  "pending",
		"credits": newCredits,
	})
}

func (h *Handler) StyleTransfer(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	user, err := h.Users.FindByID(c.Request.Context(), uid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("User not found"))
		return
	}

	if user.Credits <= 0 {
		errs.RespondError(c, errs.ErrInsufficientCredits("No credits remaining"))
		return
	}

	var req struct {
		ImageURL string  `json:"image_url" binding:"required"`
		Style    string  `json:"style" binding:"required"`
		Strength float64 `json:"strength"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	gen := &models.Generation{
		ID:          uuid.New(),
		UserID:      uid,
		Type:        "style_transfer",
		Prompt:      req.ImageURL,
		Params:      `{"style":"` + req.Style + `","strength":` + strconv.FormatFloat(req.Strength, 'f', 2, 64) + `}`,
		Status:      "pending",
		CreditsCost: 1,
		TaskID:      uuid.New().String(),
	}

	if err := h.Generations.Create(c.Request.Context(), gen); err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to create style transfer task"))
		return
	}

	newCredits, err := h.Users.UpdateCredits(c.Request.Context(), uid, -1)
	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to deduct credits"))
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"task_id": gen.TaskID,
		"status":  "pending",
		"credits": newCredits,
	})
}

func (h *Handler) GetGenerationStatus(c *gin.Context) {
	taskID := c.Param("task_id")

	gen, err := h.Generations.FindByTaskID(c.Request.Context(), taskID)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("Generation task not found"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id":    gen.TaskID,
		"type":       gen.Type,
		"status":     gen.Status,
		"result_url": gen.ResultURL,
		"error":      gen.Error,
	})
}

func (h *Handler) ListTemplates(c *gin.Context) {
	category := c.Query("category")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var templates []*models.Template
	var total int64
	var err error

	if category != "" {
		templates, total, err = h.Templates.ListByCategory(c.Request.Context(), category, limit, offset)
	} else {
		templates, total, err = h.Templates.ListAll(c.Request.Context(), limit, offset)
	}

	if err != nil {
		errs.RespondError(c, errs.ErrInternal("Failed to list templates"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"templates": templates, "total": total})
}

func (h *Handler) GetTemplate(c *gin.Context) {
	id := c.Param("id")
	tid, _ := uuid.Parse(id)

	tpl, err := h.Templates.FindByID(c.Request.Context(), tid)
	if err != nil {
		errs.RespondError(c, errs.ErrNotFound("Template not found"))
		return
	}
	c.JSON(http.StatusOK, tpl)
}

type ComplianceViolation struct {
	Keyword    string `json:"keyword"`
	Category   string `json:"category"`
	Suggestion string `json:"suggestion"`
}

func checkComplianceText(text string) (violations []ComplianceViolation, score int) {
	checks := map[string][]struct{ word, category, suggestion string }{
		"绝对化用语": {
			{"最", "绝对化用语", "建议删除或改为'优质'"},
			{"第一", "绝对化用语", "建议删除或提供权威排名数据"},
			{"唯一", "绝对化用语", "建议删除或提供行业认证"},
			{"100%", "绝对化用语", "建议改为'高比例'或'绝大多数'"},
		},
		"虚假宣传": {
			{"根治", "虚假宣传", "建议删除或改为'改善'"},
			{"无副作用", "虚假宣传", "建议删除或提供检测报告"},
		},
	}

	for _, items := range checks {
		for _, item := range items {
			if containsSubstring(text, item.word) {
				violations = append(violations, ComplianceViolation{
					Keyword: item.word, Category: item.category, Suggestion: item.suggestion,
				})
			}
		}
	}

	score = 100 - len(violations)*10
	if score < 0 {
		score = 0
	}
	return violations, score
}

func (h *Handler) CheckCompliance(c *gin.Context) {
	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	violations, score := checkComplianceText(req.Text)
	c.JSON(http.StatusOK, gin.H{
		"is_valid":   len(violations) == 0,
		"violations": violations,
		"score":      score,
	})
}

// CheckComplianceBatch checks an array of texts (e.g. every text-bearing node on a
// canvas) in a single request and returns per-item results.
func (h *Handler) CheckComplianceBatch(c *gin.Context) {
	var req struct {
		Texts []string `json:"texts" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	results := make([]gin.H, 0, len(req.Texts))
	for _, text := range req.Texts {
		violations, score := checkComplianceText(text)
		results = append(results, gin.H{
			"text":       text,
			"is_valid":   len(violations) == 0,
			"violations": violations,
			"score":      score,
		})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

func containsSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func (h *Handler) ChatCompletion(c *gin.Context) {
	var req struct {
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages" binding:"required"`
		Scene string `json:"scene"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	systemPrompt := `你是Nova启画AI助手，专注于电商素材、广告宣传片和短剧的AI创作。

你的能力：
1. 电商：主图设计、详情页规划、带货短视频脚本、爆款复刻分析
2. 广告：TVC脚本、品牌宣传片、社媒短视频、节日营销方案
3. 短剧：剧本创作、角色设计、分镜生成、多集编排

请用中文回复，内容要专业、具体、可执行。`

	if req.Scene != "" {
		sceneNames := map[string]string{
			"ecommerce": "电商素材",
			"advertising": "广告宣传片",
			"drama": "轻情景剧/短剧",
		}
		if name, ok := sceneNames[req.Scene]; ok {
			systemPrompt += "\n\n当前场景：" + name + "，请聚焦该场景的专业建议。"
		}
	}

	messages := []aimodel.DeepSeekMessage{
		{Role: "system", Content: systemPrompt},
	}
	for _, m := range req.Messages {
		messages = append(messages, aimodel.DeepSeekMessage{Role: m.Role, Content: m.Content})
	}

	reply, err := aimodel.ChatCompletion(c.Request.Context(), messages)
	if err != nil {
		errs.RespondError(c, errs.ErrModelUnavailable("LLM service unavailable: " + err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{"reply": reply})
}
