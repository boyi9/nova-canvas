package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/errs"
)

func assertNotFound(t *testing.T, err error) {
	t.Helper()
	appErr, ok := err.(*errs.AppError)
	if !ok {
		t.Fatalf("error type = %T, want *errs.AppError", err)
	}
	if appErr.Code != 404 {
		t.Fatalf("error code = %d, want 404", appErr.Code)
	}
}

func TestProjectServiceCreateAndGet(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	owner := uuid.New()

	project, err := svc.Create(context.Background(), owner, ProjectInput{Name: "demo", Scene: "ecommerce"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if project.UserID != owner {
		t.Fatalf("owner = %s, want %s", project.UserID, owner)
	}
	if project.CanvasData != "{}" || project.Status != "draft" {
		t.Fatalf("defaults not applied: %+v", project)
	}

	got, err := svc.Get(context.Background(), owner, project.ID)
	if err != nil {
		t.Fatalf("get as owner: %v", err)
	}
	if got.ID != project.ID {
		t.Fatalf("get id = %s, want %s", got.ID, project.ID)
	}

	// 其他用户读取同一项目：404，不泄露存在性
	if _, err := svc.Get(context.Background(), uuid.New(), project.ID); err == nil {
		t.Fatal("expected not found for foreign project")
	} else {
		assertNotFound(t, err)
	}
}

func TestProjectServiceRejectsForeignMutation(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	owner := uuid.New()
	attacker := uuid.New()

	project, err := svc.Create(context.Background(), owner, ProjectInput{Name: "private", Scene: "video"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := svc.Update(context.Background(), attacker, project.ID, ProjectInput{Name: "hijacked"}); err == nil {
		t.Fatal("expected foreign update to fail")
	} else {
		assertNotFound(t, err)
	}
	if err := svc.Delete(context.Background(), attacker, project.ID); err == nil {
		t.Fatal("expected foreign delete to fail")
	} else {
		assertNotFound(t, err)
	}

	stored, err := repo.FindByID(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("project should still exist: %v", err)
	}
	if stored.Name != "private" {
		t.Fatalf("project name = %q, want unchanged", stored.Name)
	}
}

func TestProjectServiceListClampsPagination(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)

	if _, _, err := svc.List(context.Background(), uuid.New(), 10_000, -5); err != nil {
		t.Fatalf("list: %v", err)
	}
	if repo.lastList.limit != maxPageLimit {
		t.Fatalf("limit = %d, want %d", repo.lastList.limit, maxPageLimit)
	}
	if repo.lastList.offset != 0 {
		t.Fatalf("offset = %d, want 0", repo.lastList.offset)
	}
}
