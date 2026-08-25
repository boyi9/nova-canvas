package workflow

import (
	"context"
	"testing"
)

func TestTopoSortOrder(t *testing.T) {
	g := Graph{
		Nodes: []Node{{ID: "a", Type: "product"}, {ID: "b", Type: "storyboard"}, {ID: "c", Type: "video_track"}},
		Edges: []Edge{{ID: "e1", Source: "a", Target: "b"}, {ID: "e2", Source: "b", Target: "c"}},
	}
	order, err := TopoSort(g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(order) != 3 || order[0] != "a" || order[1] != "b" || order[2] != "c" {
		t.Fatalf("bad order: %v", order)
	}
}

func TestTopoSortCycle(t *testing.T) {
	g := Graph{
		Nodes: []Node{{ID: "a", Type: "x"}, {ID: "b", Type: "y"}},
		Edges: []Edge{{ID: "e1", Source: "a", Target: "b"}, {ID: "e2", Source: "b", Target: "a"}},
	}
	if _, err := TopoSort(g); err == nil {
		t.Fatal("expected cycle error")
	}
}

func TestTopoSortUnknownNode(t *testing.T) {
	g := Graph{
		Nodes: []Node{{ID: "a", Type: "x"}},
		Edges: []Edge{{ID: "e", Source: "a", Target: "ghost"}},
	}
	if _, err := TopoSort(g); err == nil {
		t.Fatal("expected unknown node error")
	}
}

func TestRunDataFlowAndVariables(t *testing.T) {
	g := Graph{
		Nodes: []Node{
			{ID: "p", Type: "product", Params: map[string]any{"productName": "{{brand}}耳机", "price": "199", "sellingPoints": []any{"降噪", "长续航"}}},
			{ID: "s", Type: "storyboard", Params: map[string]any{"scenes": []any{"开场", "卖点"}}},
			{ID: "v", Type: "video_track", Params: map[string]any{"clips": []any{"clip1"}, "duration": 15}},
		},
		Edges: []Edge{
			{ID: "e1", Source: "p", Target: "s"},
			{ID: "e2", Source: "s", Target: "v"},
		},
	}
	eng := DefaultRegistry()
	res, err := eng.Run(context.Background(), g, map[string]any{"brand": "nova"})
	if err != nil {
		t.Fatalf("run error: %v", err)
	}

	if res["p"].Output["name"] != "nova耳机" {
		t.Fatalf("variable not substituted: %v", res["p"].Output["name"])
	}

	scenes, _ := res["s"].Output["scenes"].([]any)
	if len(scenes) != 3 {
		t.Fatalf("expected storyboard to merge upstream brief, got %v", scenes)
	}

	for id, r := range res {
		if r.Error != "" {
			t.Fatalf("node %s errored: %s", id, r.Error)
		}
	}
}

func TestRunUpstreamFailureSkipsOutput(t *testing.T) {
	g := Graph{
		Nodes: []Node{
			{ID: "bad", Type: "video_track", Params: nil},
			{ID: "down", Type: "storyboard", Params: map[string]any{"scenes": []any{"x"}}},
		},
		Edges: []Edge{{ID: "e", Source: "bad", Target: "down"}},
	}
	eng := DefaultRegistry()
	res, err := eng.Run(context.Background(), g, nil)
	if err != nil {
		t.Fatalf("run error: %v", err)
	}
	if res["bad"].Error != "" {
		t.Fatalf("expected bad node to error, got %v", res["bad"])
	}
	// downstream should still run, but with no upstream brief
	scenes, _ := res["down"].Output["scenes"].([]any)
	if len(scenes) != 1 {
		t.Fatalf("expected downstream unaffected, got %v", scenes)
	}
}
