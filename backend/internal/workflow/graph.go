package workflow

import (
	"errors"
	"fmt"
)

// Node is a single unit in a workflow graph.
type Node struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Params   map[string]any `json:"params,omitempty"`
	Position *Position     `json:"position,omitempty"`
}

// Position is an optional layout hint; the engine ignores it.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Edge connects a source node's output to a target node's input.
type Edge struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"sourceHandle,omitempty"`
	TargetHandle string `json:"targetHandle,omitempty"`
}

// Graph is the full workflow definition.
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// TopoSort returns node IDs in dependency order (Kahn's algorithm).
// It errors on cycles or references to unknown nodes.
func TopoSort(g Graph) ([]string, error) {
	ids := make(map[string]struct{}, len(g.Nodes))
	for _, n := range g.Nodes {
		if n.ID == "" {
			return nil, errors.New("workflow: node with empty id")
		}
		if _, dup := ids[n.ID]; dup {
			return nil, fmt.Errorf("workflow: duplicate node id %q", n.ID)
		}
		ids[n.ID] = struct{}{}
	}

	indeg := make(map[string]int, len(g.Nodes))
	for _, n := range g.Nodes {
		indeg[n.ID] = 0
	}
	adj := make(map[string][]string)
	for _, e := range g.Edges {
		if _, ok := ids[e.Source]; !ok {
			return nil, fmt.Errorf("workflow: edge %q references unknown source %q", e.ID, e.Source)
		}
		if _, ok := ids[e.Target]; !ok {
			return nil, fmt.Errorf("workflow: edge %q references unknown target %q", e.ID, e.Target)
		}
		adj[e.Source] = append(adj[e.Source], e.Target)
		indeg[e.Target]++
	}

	queue := make([]string, 0, len(g.Nodes))
	for id, d := range indeg {
		if d == 0 {
			queue = append(queue, id)
		}
	}

	order := make([]string, 0, len(g.Nodes))
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		order = append(order, cur)
		for _, next := range adj[cur] {
			indeg[next]--
			if indeg[next] == 0 {
				queue = append(queue, next)
			}
		}
	}

	if len(order) != len(g.Nodes) {
		return nil, errors.New("workflow: cycle detected in graph")
	}
	return order, nil
}
