package v1

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"gorm.io/gorm"

	"nova-canvas/backend/internal/model"
	"nova-canvas/backend/internal/service"
	"nova-canvas/backend/pkg/errno"
	"nova-canvas/backend/pkg/response"
)

// GenerationHandler 处理 AI 生成相关接口
type GenerationHandler struct {
	db        *gorm.DB
	svc       *service.GenerationService
	validator *validator.Validate
}

// NewGenerationHandler 构造函数
func NewGenerationHandler(db *gorm.DB, svc *service.GenerationService) *GenerationHandler {
	return &GenerationHandler{
		db:        db,
		svc:       svc,
		validator: validator.New(),
	}
}

// CreateGenerationRequest 创建生成任务请求
// @Summary 创建 AI 生成任务
// @Description 根据参考节点和提示词创建图片/视频生成任务，异步执行
// @Tags Generation
// @Accept json
// @Produce json
// @Param Authorization header string true "Bearer JWT"
// @Param request body CreateGenerationRequest true "生成参数"
// @Success 200 {object} response.Response{data=CreateGenerationResponse} "创建成功"
// @Failure 400 {object} response.Response "参数校验失败"
// @Failure 401 {object} response.Response "未授权"
// @Failure 404 {object} response.Response "用户/节点不存在"
// @Failure 500 {object} response.Response "内部错误"
// @Router /api/v1/generations [post]
func (h *GenerationHandler) CreateGeneration(c *gin.Context) {
	var req CreateGenerationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errno.ErrInvalidParam.WithMessage(err.Error()))
		return
	}

	if err := h.validator.Struct(req); err != nil {
		response.Error(c, errno.ErrInvalidParam.WithMessage(err.Error()))
		return
	}

	// 从上下文获取用户ID（由 auth 中间件注入）
	userID, exists := c.Get("userID")
	if !exists {
		response.Error(c, errno.ErrUnauthorized)
		return
	}

	resp, err := h.svc.CreateGeneration(c.Request.Context(), userID.(uint64), &req)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, resp)
}

// GetGenerationRequest 查询生成任务请求
type GetGenerationRequest struct {
	TaskID string `uri:"task_id" binding:"required,uuid" example:"550e8400-e29b-41d4-a716-446655440000"`
}

// GetGenerationResponse 查询生成任务响应
type GetGenerationResponse struct {
	TaskID     string  `json:"task_id"`
	Status     string  `json:"status"`      // pending/running/succeeded/failed
	Progress   int     `json:"progress"`    // 0-100
	ResultURL  string  `json:"result_url"`  // 成功时返回
	ErrorMsg   string  `json:"error_msg"`   // 失败时返回
	CreatedAt  int64   `json:"created_at"`
	UpdatedAt  int64   `json:"updated_at"`
}

// GetGeneration 获取生成任务详情
// @Summary 查询生成任务状态
// @Description 根据任务ID查询生成任务的执行进度和结果
// @Tags Generation
// @Accept json
// @Produce json
// @Param Authorization header string true "Bearer JWT"
// @Param task_id path string true "任务ID"
// @Success 200 {object} response.Response{data=GetGenerationResponse} "查询成功"
// @Failure 400 {object} response.Response "参数校验失败"
// @Failure 401 {object} response.Response "未授权"
// @Failure 404 {object} response.Response "任务不存在"
// @Router /api/v1/generations/{task_id} [get]
func (h *GenerationHandler) GetGeneration(c *gin.Context) {
	var req GetGenerationRequest
	if err := c.ShouldBindUri(&req); err != nil {
		response.Error(c, errno.ErrInvalidParam.WithMessage(err.Error()))
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		response.Error(c, errno.ErrUnauthorized)
		return
	}

	resp, err := h.svc.GetGeneration(c.Request.Context(), userID.(uint64), req.TaskID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, resp)
}

// ListGenerationsRequest 列表查询请求
type ListGenerationsRequest struct {
	Page     int    `form:"page,default=1" binding:"min=1" example:"1"`
	PageSize int    `form:"page_size,default=20" binding:"min=1,max=100" example:"20"`
	Status   string `form:"status" binding:"omitempty,oneof=pending running succeeded failed" example:"succeeded"`
	NodeType string `form:"node_type" binding:"omitempty,oneof=image video" example:"image"`
}

// ListGenerationsResponse 列表响应
type ListGenerationsResponse struct {
	Total int64                   `json:"total"`
	List  []GetGenerationResponse `json:"list"`
}

// ListGenerations 获取生成任务列表
// @Summary 分页查询生成任务列表
// @Description 按状态、节点类型筛选，支持分页
// @Tags Generation
// @Accept json
// @Produce json
// @Param Authorization header string true "Bearer JWT"
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Param status query string false "状态筛选" Enums(pending, running, succeeded, failed)
// @Param node_type query string false "节点类型筛选" Enums(image, video)
// @Success 200 {object} response.Response{data=ListGenerationsResponse} "查询成功"
// @Failure 400 {object} response.Response "参数校验失败"
// @Failure 401 {object} response.Response "未授权"
// @Router /api/v1/generations [get]
func (h *GenerationHandler) ListGenerations(c *gin.Context) {
	var req ListGenerationsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.Error(c, errno.ErrInvalidParam.WithMessage(err.Error()))
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		response.Error(c, errno.ErrUnauthorized)
		return
	}

	resp, err := h.svc.ListGenerations(c.Request.Context(), userID.(uint64), &req)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, resp)
}

// CancelGenerationRequest 取消任务请求
type CancelGenerationRequest struct {
	TaskID string `uri:"task_id" binding:"required,uuid" example:"550e8400-e29b-41d4-a716-446655440000"`
}

// CancelGeneration 取消正在执行的生成任务
// @Summary 取消生成任务
// @Description 仅支持取消 pending/running 状态的任务
// @Tags Generation
// @Accept json
// @Produce json
// @Param Authorization header string true "Bearer JWT"
// @Param task_id path string true "任务ID"
// @Success 200 {object} response.Response "取消成功"
// @Failure 400 {object} response.Response "参数校验失败或状态不允许取消"
// @Failure 401 {object} response.Response "未授权"
// @Failure 404 {object} response.Response "任务不存在"
// @Router /api/v1/generations/{task_id}/cancel [post]
func (h *GenerationHandler) CancelGeneration(c *gin.Context) {
	var req CancelGenerationRequest
	if err := c.ShouldBindUri(&req); err != nil {
		response.Error(c, errno.ErrInvalidParam.WithMessage(err.Error()))
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		response.Error(c, errno.ErrUnauthorized)
		return
	}

	if err := h.svc.CancelGeneration(c.Request.Context(), userID.(uint64), req.TaskID); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, nil)
}

// RegisterRoutes 注册路由
func (h *GenerationHandler) RegisterRoutes(rg *gin.RouterGroup) {
	gen := rg.Group("/generations")
	{
		gen.POST("", h.CreateGeneration)
		gen.GET("", h.ListGenerations)
		gen.GET("/:task_id", h.GetGeneration)
		gen.POST("/:task_id/cancel", h.CancelGeneration)
	}
}

// ============ Request/Response DTOs ============

type CreateGenerationRequest struct {
	Prompt           string   `json:"prompt" binding:"required,min=1,max=2000" example:"A futuristic cityscape at sunset, cyberpunk style"`
	NegativePrompt   string   `json:"negative_prompt" binding:"max=1000" example:"blurry, low quality"`
	Model            string   `json:"model" binding:"required,oneof=seedream-5.0 seedance-2.0 flux" example:"seedream-5.0"`
	Parameters       JSONMap  `json:"parameters" binding:"omitempty"`
	ReferenceNodeIDs []string `json:"reference_node_ids" binding:"omitempty,dive,uuid" example:"[\"550e8400-e29b-41d4-a716-446655440000\"]"`
	InsertPosition   *Position `json:"insert_position" binding:"omitempty"`
	NodeType         string   `json:"node_type" binding:"required,oneof=generation reference" example:"generation"`
}

type CreateGenerationResponse struct {
	TaskID string `json:"task_id" example:"550e8400-e29b-41d4-a716-446655440000"`
}

type Position struct {
	X float64 `json:"x" binding:"required" example:"100"`
	Y float64 `json:"y" binding:"required" example:"200"`
}

type JSONMap map[string]interface{}

// Validate 自定义校验：parameters 必须是有效的 JSON 对象
func (r *CreateGenerationRequest) Validate() error {
	if r.Parameters != nil {
		// 这里可以加更复杂的校验，如模型特定参数
	}
	return nil
}