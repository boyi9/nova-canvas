// Package service 承载业务用例层：handler 只负责 HTTP 绑定/响应，
// service 负责鉴权归属、业务规则与仓储编排，repository 只负责持久化。
package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/models"
	"nova-canvas-backend/internal/repository"
)

// 分页上限：避免客户端传入超大 limit 拖垮数据库。
const (
	defaultPageLimit = 20
	maxPageLimit     = 100
)

// ProjectInput 是创建/更新项目的领域输入（与 HTTP DTO 解耦）。
type ProjectInput struct {
	Name        string
	Description string
	Scene       string
	CanvasData  string
	Status      string
}

type ProjectService struct {
	projects repository.ProjectRepository
}

func NewProjectService(projects repository.ProjectRepository) *ProjectService {
	return &ProjectService{projects: projects}
}

func (s *ProjectService) List(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*models.Project, int64, error) {
	return s.projects.ListByUser(ctx, userID, clampLimit(limit), clampOffset(offset))
}

func (s *ProjectService) Create(ctx context.Context, userID uuid.UUID, in ProjectInput) (*models.Project, error) {
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Scene) == "" {
		return nil, errs.ErrBadRequest("name and scene are required")
	}
	canvasData := in.CanvasData
	if canvasData == "" {
		canvasData = "{}"
	}
	project := &models.Project{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        in.Name,
		Description: in.Description,
		Scene:       in.Scene,
		CanvasData:  canvasData,
		Status:      "draft",
	}
	if err := s.projects.Create(ctx, project); err != nil {
		return nil, errs.ErrInternal("Failed to create project")
	}
	return project, nil
}

// Get 统一做对象级权限校验：他人的项目按 404 处理，不泄露存在性。
func (s *ProjectService) Get(ctx context.Context, userID, projectID uuid.UUID) (*models.Project, error) {
	project, err := s.projects.FindByID(ctx, projectID)
	if err != nil || project.UserID != userID {
		return nil, errs.ErrNotFound("Project not found")
	}
	return project, nil
}

func (s *ProjectService) Update(ctx context.Context, userID, projectID uuid.UUID, in ProjectInput) (*models.Project, error) {
	project, err := s.Get(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	// 空字符串表示「不修改该字段」，与既有 PATCH 语义保持一致。
	if in.Name != "" {
		project.Name = in.Name
	}
	if in.Description != "" {
		project.Description = in.Description
	}
	if in.CanvasData != "" {
		project.CanvasData = in.CanvasData
	}
	if in.Status != "" {
		project.Status = in.Status
	}
	if err := s.projects.Update(ctx, project); err != nil {
		return nil, errs.ErrInternal("Failed to update project")
	}
	return project, nil
}

func (s *ProjectService) Delete(ctx context.Context, userID, projectID uuid.UUID) error {
	if _, err := s.Get(ctx, userID, projectID); err != nil {
		return err
	}
	if err := s.projects.Delete(ctx, projectID); err != nil {
		return errs.ErrInternal("Failed to delete project")
	}
	return nil
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultPageLimit
	}
	if limit > maxPageLimit {
		return maxPageLimit
	}
	return limit
}

func clampOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}
