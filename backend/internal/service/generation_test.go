package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"nova-canvas-backend/internal/models"
)

func TestGenerationServiceCreateDeductsCredits(t *testing.T) {
	users := newFakeUserRepo()
	gens := newFakeGenerationRepo()
	owner := uuid.New()
	if err := users.Create(context.Background(), &models.User{ID: owner, Credits: 5}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	svc := NewGenerationService(gens, users)

	gen, credits, err := svc.Create(context.Background(), owner, GenerationInput{
		Type:   "video",
		Prompt: "demo",
		Params: `{"duration":5}`,
		Cost:   10,
	})
	// 余额 5 < 10：拒绝且不落库
	if err == nil {
		t.Fatal("expected insufficient credits")
	}
	if credits != 0 {
		t.Fatalf("credits = %d, want 0", credits)
	}
	if gen != nil {
		t.Fatal("generation should not be created")
	}

	gen, credits, err = svc.Create(context.Background(), owner, GenerationInput{
		Type:   "image",
		Prompt: "demo",
		Cost:   1,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if credits != 4 {
		t.Fatalf("remaining credits = %d, want 4", credits)
	}
	if gen.UserID != owner || gen.Status != "pending" || gen.TaskID == "" {
		t.Fatalf("unexpected generation: %+v", gen)
	}
}

func TestGenerationServiceStatusEnforcesOwnership(t *testing.T) {
	users := newFakeUserRepo()
	gens := newFakeGenerationRepo()
	owner := uuid.New()
	if err := users.Create(context.Background(), &models.User{ID: owner, Credits: 5}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	svc := NewGenerationService(gens, users)
	gen, _, err := svc.Create(context.Background(), owner, GenerationInput{Type: "image", Prompt: "p", Cost: 1})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := svc.Status(context.Background(), owner, gen.TaskID); err != nil {
		t.Fatalf("owner status: %v", err)
	}
	if _, err := svc.Status(context.Background(), uuid.New(), gen.TaskID); err == nil {
		t.Fatal("expected not found for foreign task")
	} else {
		assertNotFound(t, err)
	}
}
