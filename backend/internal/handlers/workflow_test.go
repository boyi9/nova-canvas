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

func setupWorkflowRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil, nil, nil, nil)
	r := gin.New()
	v1 := r.Group("/api/v1")
	{
		v1.POST("/workflows/run", h.RunWorkflow)
	}
	return r
}

func TestRunWorkflowDeterministic(t *testing.T) {
	r := setupWorkflowRouter()
	reqBody := map[string]any{
		"nodes": []map[string]any{
			{
				"id":   "p1",
				"type": "product",
				"params": map[string]any{
					"productName":   "精华",
					"price":         "199",
					"sellingPoints": []any{"买一送一"},
				},
			},
			{
				"id":     "s1",
				"type":   "storyboard",
				"params": map[string]any{"scenes": []any{"开场"}},
			},
		},
		"edges": []map[string]any{
			{"id": "e1", "source": "p1", "target": "s1"},
		},
		"variables": map[string]any{},
	}
	body, _ := json.Marshal(reqBody)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/workflows/run", bytes.NewReader(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("run status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp struct {
		Results map[string]workflow.Result `json:"results"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(resp.Results))
	}
	product := resp.Results["p1"]
	if product.Error != "" {
		t.Fatalf("product node error: %s", product.Error)
	}
	if product.Output["brief"] == nil {
		t.Fatalf("expected product brief in output, got %+v", product.Output)
	}
	story := resp.Results["s1"]
	if story.Error != "" {
		t.Fatalf("storyboard node error: %s", story.Error)
	}
}
