package repository

import (
	"context"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/models"
)

type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	FindByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	Update(ctx context.Context, user *models.User) error
	UpdateCredits(ctx context.Context, id uuid.UUID, delta int) (int, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type ProjectRepository interface {
	Create(ctx context.Context, project *models.Project) error
	FindByID(ctx context.Context, id uuid.UUID) (*models.Project, error)
	ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*models.Project, int64, error)
	Update(ctx context.Context, project *models.Project) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type GenerationRepository interface {
	Create(ctx context.Context, gen *models.Generation) error
	FindByID(ctx context.Context, id uuid.UUID) (*models.Generation, error)
	FindByTaskID(ctx context.Context, taskID string) (*models.Generation, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status, resultURL, resultMeta, errMsg string) error
	ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*models.Generation, int64, error)
	ListPending(ctx context.Context, limit int) ([]*models.Generation, error)
}

type TemplateRepository interface {
	Create(ctx context.Context, tpl *models.Template) error
	FindByID(ctx context.Context, id uuid.UUID) (*models.Template, error)
	ListByCategory(ctx context.Context, category string, limit, offset int) ([]*models.Template, int64, error)
	ListAll(ctx context.Context, limit, offset int) ([]*models.Template, int64, error)
}

type Repos struct {
	Users       UserRepository
	Projects    ProjectRepository
	Generations GenerationRepository
	Templates   TemplateRepository
}
