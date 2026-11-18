package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/models"
)

var errNotFound = errors.New("not found")

type fakeUserRepo struct {
	users map[uuid.UUID]*models.User
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{users: map[uuid.UUID]*models.User{}}
}

func (r *fakeUserRepo) Create(_ context.Context, user *models.User) error {
	clone := *user
	r.users[user.ID] = &clone
	return nil
}

func (r *fakeUserRepo) FindByID(_ context.Context, id uuid.UUID) (*models.User, error) {
	user, ok := r.users[id]
	if !ok {
		return nil, errNotFound
	}
	clone := *user
	return &clone, nil
}

func (r *fakeUserRepo) FindByEmail(_ context.Context, email string) (*models.User, error) {
	for _, user := range r.users {
		if user.Email == email {
			clone := *user
			return &clone, nil
		}
	}
	return nil, errNotFound
}

func (r *fakeUserRepo) Update(_ context.Context, user *models.User) error {
	if _, ok := r.users[user.ID]; !ok {
		return errNotFound
	}
	clone := *user
	r.users[user.ID] = &clone
	return nil
}

func (r *fakeUserRepo) UpdateCredits(_ context.Context, id uuid.UUID, delta int) (int, error) {
	user, ok := r.users[id]
	if !ok {
		return 0, errNotFound
	}
	user.Credits += delta
	return user.Credits, nil
}

func (r *fakeUserRepo) Delete(_ context.Context, id uuid.UUID) error {
	delete(r.users, id)
	return nil
}

type fakeProjectRepo struct {
	projects map[uuid.UUID]*models.Project
	lastList struct{ limit, offset int }
}

func newFakeProjectRepo() *fakeProjectRepo {
	return &fakeProjectRepo{projects: map[uuid.UUID]*models.Project{}}
}

func (r *fakeProjectRepo) Create(_ context.Context, project *models.Project) error {
	clone := *project
	r.projects[project.ID] = &clone
	return nil
}

func (r *fakeProjectRepo) FindByID(_ context.Context, id uuid.UUID) (*models.Project, error) {
	project, ok := r.projects[id]
	if !ok {
		return nil, errNotFound
	}
	clone := *project
	return &clone, nil
}

func (r *fakeProjectRepo) ListByUser(_ context.Context, userID uuid.UUID, limit, offset int) ([]*models.Project, int64, error) {
	r.lastList.limit = limit
	r.lastList.offset = offset
	var out []*models.Project
	for _, project := range r.projects {
		if project.UserID == userID {
			clone := *project
			out = append(out, &clone)
		}
	}
	return out, int64(len(out)), nil
}

func (r *fakeProjectRepo) Update(_ context.Context, project *models.Project) error {
	if _, ok := r.projects[project.ID]; !ok {
		return errNotFound
	}
	clone := *project
	r.projects[project.ID] = &clone
	return nil
}

func (r *fakeProjectRepo) Delete(_ context.Context, id uuid.UUID) error {
	delete(r.projects, id)
	return nil
}

type fakeGenerationRepo struct {
	gens     map[uuid.UUID]*models.Generation
	byTaskID map[string]*models.Generation
}

func newFakeGenerationRepo() *fakeGenerationRepo {
	return &fakeGenerationRepo{
		gens:     map[uuid.UUID]*models.Generation{},
		byTaskID: map[string]*models.Generation{},
	}
}

func (r *fakeGenerationRepo) Create(_ context.Context, gen *models.Generation) error {
	clone := *gen
	r.gens[gen.ID] = &clone
	r.byTaskID[gen.TaskID] = &clone
	return nil
}

func (r *fakeGenerationRepo) FindByID(_ context.Context, id uuid.UUID) (*models.Generation, error) {
	gen, ok := r.gens[id]
	if !ok {
		return nil, errNotFound
	}
	clone := *gen
	return &clone, nil
}

func (r *fakeGenerationRepo) FindByTaskID(_ context.Context, taskID string) (*models.Generation, error) {
	gen, ok := r.byTaskID[taskID]
	if !ok {
		return nil, errNotFound
	}
	clone := *gen
	return &clone, nil
}

func (r *fakeGenerationRepo) UpdateStatus(_ context.Context, id uuid.UUID, status, resultURL, resultMeta, errMsg string) error {
	gen, ok := r.gens[id]
	if !ok {
		return errNotFound
	}
	gen.Status = status
	gen.ResultURL = resultURL
	gen.ResultMeta = resultMeta
	gen.Error = errMsg
	return nil
}

func (r *fakeGenerationRepo) ListByUser(_ context.Context, userID uuid.UUID, limit, offset int) ([]*models.Generation, int64, error) {
	var out []*models.Generation
	for _, gen := range r.gens {
		if gen.UserID == userID {
			clone := *gen
			out = append(out, &clone)
		}
	}
	return out, int64(len(out)), nil
}

func (r *fakeGenerationRepo) ListPending(_ context.Context, limit int) ([]*models.Generation, error) {
	return nil, nil
}
