package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"nova-canvas-backend/internal/models"
)

type pgUserRepo struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &pgUserRepo{db: db}
}

func (r *pgUserRepo) Create(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *pgUserRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *pgUserRepo) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *pgUserRepo) Update(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *pgUserRepo) UpdateCredits(ctx context.Context, id uuid.UUID, delta int) (int, error) {
	var newCredits int
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.First(&user, "id = ?", id).Error; err != nil {
			return err
		}
		newCredits = user.Credits + delta
		if newCredits < 0 {
			return fmt.Errorf("insufficient credits: have %d, need %d", user.Credits, -delta)
		}
		return tx.Model(&user).Update("credits", newCredits).Error
	})
	return newCredits, err
}

func (r *pgUserRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.User{}, "id = ?", id).Error
}

type pgProjectRepo struct {
	db *gorm.DB
}

func NewProjectRepository(db *gorm.DB) ProjectRepository {
	return &pgProjectRepo{db: db}
}

func (r *pgProjectRepo) Create(ctx context.Context, project *models.Project) error {
	return r.db.WithContext(ctx).Create(project).Error
}

func (r *pgProjectRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.Project, error) {
	var project models.Project
	if err := r.db.WithContext(ctx).Preload("User").First(&project, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &project, nil
}

func (r *pgProjectRepo) ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*models.Project, int64, error) {
	var projects []*models.Project
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if err := query.Model(&models.Project{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Order("updated_at DESC").Limit(limit).Offset(offset).Find(&projects).Error; err != nil {
		return nil, 0, err
	}
	return projects, total, nil
}

func (r *pgProjectRepo) Update(ctx context.Context, project *models.Project) error {
	return r.db.WithContext(ctx).Save(project).Error
}

func (r *pgProjectRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.Project{}, "id = ?", id).Error
}

type pgGenerationRepo struct {
	db *gorm.DB
}

func NewGenerationRepository(db *gorm.DB) GenerationRepository {
	return &pgGenerationRepo{db: db}
}

func (r *pgGenerationRepo) Create(ctx context.Context, gen *models.Generation) error {
	return r.db.WithContext(ctx).Create(gen).Error
}

func (r *pgGenerationRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.Generation, error) {
	var gen models.Generation
	if err := r.db.WithContext(ctx).First(&gen, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &gen, nil
}

func (r *pgGenerationRepo) FindByTaskID(ctx context.Context, taskID string) (*models.Generation, error) {
	var gen models.Generation
	if err := r.db.WithContext(ctx).Where("task_id = ?", taskID).First(&gen).Error; err != nil {
		return nil, err
	}
	return &gen, nil
}

func (r *pgGenerationRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status, resultURL, resultMeta, errMsg string) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if resultURL != "" {
		updates["result_url"] = resultURL
	}
	if resultMeta != "" {
		updates["result_meta"] = resultMeta
	}
	if errMsg != "" {
		updates["error"] = errMsg
	}
	return r.db.WithContext(ctx).Model(&models.Generation{}).Where("id = ?", id).Updates(updates).Error
}

func (r *pgGenerationRepo) ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*models.Generation, int64, error) {
	var gens []*models.Generation
	var total int64

	query := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if err := query.Model(&models.Generation{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&gens).Error; err != nil {
		return nil, 0, err
	}
	return gens, total, nil
}

func (r *pgGenerationRepo) ListPending(ctx context.Context, limit int) ([]*models.Generation, error) {
	var gens []*models.Generation
	err := r.db.WithContext(ctx).
		Where("status IN ?", []string{"pending", "processing"}).
		Order("created_at ASC").
		Limit(limit).
		Find(&gens).Error
	return gens, err
}

type pgTemplateRepo struct {
	db *gorm.DB
}

func NewTemplateRepository(db *gorm.DB) TemplateRepository {
	return &pgTemplateRepo{db: db}
}

func (r *pgTemplateRepo) Create(ctx context.Context, tpl *models.Template) error {
	return r.db.WithContext(ctx).Create(tpl).Error
}

func (r *pgTemplateRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.Template, error) {
	var tpl models.Template
	if err := r.db.WithContext(ctx).First(&tpl, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

func (r *pgTemplateRepo) ListByCategory(ctx context.Context, category string, limit, offset int) ([]*models.Template, int64, error) {
	var templates []*models.Template
	var total int64

	query := r.db.WithContext(ctx).Where("category = ?", category)
	if err := query.Model(&models.Template{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Limit(limit).Offset(offset).Find(&templates).Error; err != nil {
		return nil, 0, err
	}
	return templates, total, nil
}

func (r *pgTemplateRepo) ListAll(ctx context.Context, limit, offset int) ([]*models.Template, int64, error) {
	var templates []*models.Template
	var total int64

	if err := r.db.WithContext(ctx).Model(&models.Template{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := r.db.WithContext(ctx).Limit(limit).Offset(offset).Find(&templates).Error; err != nil {
		return nil, 0, err
	}
	return templates, total, nil
}

// Compile-time interface checks
var (
	_ UserRepository      = (*pgUserRepo)(nil)
	_ ProjectRepository   = (*pgProjectRepo)(nil)
	_ GenerationRepository = (*pgGenerationRepo)(nil)
	_ TemplateRepository  = (*pgTemplateRepo)(nil)
)

// unused import workaround
var _ = sql.ErrNoRows
