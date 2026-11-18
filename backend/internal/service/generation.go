package service

import (
	"context"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/models"
	"nova-canvas-backend/internal/repository"
)

// GenerationInput 是创建生成任务的领域输入。
type GenerationInput struct {
	Type   string
	Prompt string
	Params string
	// Cost 为本次生成消耗的积分。
	Cost int
	// InsufficientDetail 允许 transport 层保留既有错误文案；为空时使用通用文案。
	InsufficientDetail string
}

type GenerationService struct {
	generations repository.GenerationRepository
	users       repository.UserRepository
}

func NewGenerationService(generations repository.GenerationRepository, users repository.UserRepository) *GenerationService {
	return &GenerationService{generations: generations, users: users}
}

// Create 校验用户与积分后落库生成任务，并按 Cost 扣减积分。
// 返回新建任务与扣减后的积分余额。
func (s *GenerationService) Create(ctx context.Context, userID uuid.UUID, in GenerationInput) (*models.Generation, int, error) {
	cost := in.Cost
	if cost <= 0 {
		cost = 1
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, 0, errs.ErrNotFound("User not found")
	}
	if user.Credits < cost {
		detail := in.InsufficientDetail
		if detail == "" {
			detail = "Insufficient credits"
		}
		return nil, 0, errs.ErrInsufficientCredits(detail)
	}

	gen := &models.Generation{
		ID:          uuid.New(),
		UserID:      userID,
		Type:        in.Type,
		Prompt:      in.Prompt,
		Params:      in.Params,
		Status:      "pending",
		CreditsCost: cost,
		TaskID:      uuid.New().String(),
	}
	if err := s.generations.Create(ctx, gen); err != nil {
		return nil, 0, errs.ErrInternal("Failed to create generation task")
	}

	newCredits, err := s.users.UpdateCredits(ctx, userID, -cost)
	if err != nil {
		return nil, 0, errs.ErrInternal("Failed to deduct credits")
	}
	return gen, newCredits, nil
}

// Status 按 task_id 查询生成任务，并校验归属：他人的任务按 404 处理。
func (s *GenerationService) Status(ctx context.Context, userID uuid.UUID, taskID string) (*models.Generation, error) {
	gen, err := s.generations.FindByTaskID(ctx, taskID)
	if err != nil || gen.UserID != userID {
		return nil, errs.ErrNotFound("Generation task not found")
	}
	return gen, nil
}
