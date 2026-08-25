package workflow

import (
	"context"
	"fmt"
	"regexp"
)

// Result holds the outcome of executing a single node.
type Result struct {
	NodeID string         `json:"node_id"`
	Type   string         `json:"type"`
	Output map[string]any `json:"output,omitempty"`
	Error  string         `json:"error,omitempty"`
}

// Handler transforms a node's inputs + params (already variable-substituted)
// into outputs. inputs maps an upstream node ID to that node's Output map.
type Handler func(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error)

// Engine executes a workflow graph using a registry of node handlers.
type Engine struct {
	handlers map[string]Handler
}

// NewEngine creates an engine with no handlers.
func NewEngine() *Engine {
	return &Engine{handlers: make(map[string]Handler)}
}

// Register binds a node type to a handler.
func (e *Engine) Register(nodeType string, h Handler) {
	e.handlers[nodeType] = h
}

var varPattern = regexp.MustCompile(`\{\{\s*([\w.-]+)\s*\}\}`)

// substitute replaces {{var}} occurrences with values from variables inside
// any string, recursing through maps and slices.
func substitute(value any, variables map[string]any) any {
	switch v := value.(type) {
	case string:
		return varPattern.ReplaceAllStringFunc(v, func(m string) string {
			key := varPattern.FindStringSubmatch(m)[1]
			if repl, ok := variables[key]; ok {
				return fmt.Sprintf("%v", repl)
			}
			return m
		})
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, val := range v {
			out[k] = substitute(val, variables)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, val := range v {
			out[i] = substitute(val, variables)
		}
		return out
	default:
		return v
	}
}

// Run executes the graph and returns results keyed by node ID, in topo order.
// Upstream failures are recorded on the node but do not abort the run; the
// failed node's output is simply absent from downstream inputs.
func (e *Engine) Run(ctx context.Context, g Graph, variables map[string]any) (map[string]Result, error) {
	order, err := TopoSort(g)
	if err != nil {
		return nil, err
	}
	if variables == nil {
		variables = map[string]any{}
	}

	results := make(map[string]Result, len(g.Nodes))
	nodeByID := make(map[string]Node, len(g.Nodes))
	for _, n := range g.Nodes {
		nodeByID[n.ID] = n
	}

	for _, id := range order {
		n := nodeByID[id]

		sub := substitute(n.Params, variables)
		if m, ok := sub.(map[string]any); ok {
			n.Params = m
		} else {
			n.Params = map[string]any{}
		}

		inputs := make(map[string]any)
		for _, edge := range g.Edges {
			if edge.Target != id {
				continue
			}
			if up, ok := results[edge.Source]; ok && up.Error == "" {
				inputs[edge.Source] = up.Output
			}
		}

		handler, ok := e.handlers[n.Type]
		if !ok {
			handler = defaultHandler
		}

		out, herr := handler(ctx, n, inputs, variables)
		if herr != nil {
			results[id] = Result{NodeID: id, Type: n.Type, Error: herr.Error()}
			continue
		}
		if out == nil {
			out = map[string]any{}
		}
		results[id] = Result{NodeID: id, Type: n.Type, Output: out}
	}

	return results, nil
}

func defaultHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	if n.Params == nil {
		return map[string]any{}, nil
	}
	return n.Params, nil
}
