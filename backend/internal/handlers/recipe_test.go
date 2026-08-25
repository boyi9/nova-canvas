package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"nova-canvas-backend/internal/workflow"
)

func setupRecipeRouter() (*gin.Engine, *Handler) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil, nil, nil, nil)
	r := gin.New()
	v1 := r.Group("/api/v1")
	{
		v1.POST("/recipes", h.SaveRecipe)
		v1.GET("/recipes", h.ListRecipes)
		v1.GET("/recipes/:id", h.GetRecipe)
		v1.POST("/recipes/:id/apply", h.ApplyRecipe)
	}
	return r, h
}

func TestRecipeSaveListApplyRoundTrip(t *testing.T) {
	r, _ := setupRecipeRouter()
	recipe := workflow.Recipe{
		Name:      "demo",
		Variables: []workflow.Variable{{Name: "brand"}},
		Graph: workflow.Graph{
			Nodes: []workflow.Node{
				{ID: "n1", Type: "product", Position: &workflow.Position{X: 0, Y: 0}, Params: map[string]any{"title": "{{brand}} 直播"}},
				{ID: "n2", Type: "text", Position: &workflow.Position{X: 100, Y: 0}, Params: map[string]any{"title": "结尾"}},
			},
			Edges: []workflow.Edge{{ID: "e1", Source: "n1", Target: "n2"}},
		},
	}
	body, _ := json.Marshal(recipe)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/recipes", bytes.NewReader(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("save status = %d, body = %s", w.Code, w.Body.String())
	}
	var saved workflow.Recipe
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
		t.Fatalf("decode saved: %v", err)
	}
	if saved.ID == "" {
		t.Fatalf("expected saved recipe to have an ID")
	}

	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/api/v1/recipes/"+saved.ID+"/apply", bytes.NewReader(mustJSON(map[string]any{"values": map[string]any{"brand": "花西子"}})))
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("apply status = %d, body = %s", w2.Code, w2.Body.String())
	}
	var resp struct {
		Graph workflow.Graph `json:"graph"`
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode apply: %v", err)
	}
	if len(resp.Graph.Nodes) != 2 {
		t.Fatalf("expected 2 nodes after apply, got %d", len(resp.Graph.Nodes))
	}
	if len(resp.Graph.Edges) != 1 {
		t.Fatalf("expected 1 edge after apply, got %d", len(resp.Graph.Edges))
	}
	found := false
	for _, n := range resp.Graph.Nodes {
		if title, ok := n.Params["title"].(string); ok && title == "花西子 直播" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected {{brand}} substituted to 花西子 in node title, got %+v", resp.Graph.Nodes)
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
