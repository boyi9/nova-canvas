package workflow

// Variable is a parameter slot in a recipe. Explicit apply-time values override
// the recipe's own default.
type Variable struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Default     any    `json:"default,omitempty"`
}

// Recipe is a reusable workflow template: a graph whose node params may contain
// {{var}} placeholders, plus the variable slots used to fill them.
type Recipe struct {
	ID          string     `json:"id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Variables   []Variable `json:"variables,omitempty"`
	Graph       Graph      `json:"graph"`
}

// Instantiate produces a concrete Graph by resolving each variable (explicit
// values override defaults) and substituting {{var}} placeholders in node
// params. Edges are copied verbatim.
func (r Recipe) Instantiate(values map[string]any) Graph {
	resolved := make(map[string]any, len(r.Variables))
	for _, v := range r.Variables {
		if v.Default != nil {
			resolved[v.Name] = v.Default
		}
	}
	for k, val := range values {
		resolved[k] = val
	}
	return Graph{
		Nodes: cloneNodesWithSubstitution(r.Graph.Nodes, resolved),
		Edges: r.Graph.Edges,
	}
}

func cloneNodesWithSubstitution(nodes []Node, vars map[string]any) []Node {
	out := make([]Node, len(nodes))
	for i, n := range nodes {
		params := substitute(n.Params, vars)
		if m, ok := params.(map[string]any); ok {
			out[i] = Node{ID: n.ID, Type: n.Type, Position: n.Position, Params: m}
		} else {
			out[i] = Node{ID: n.ID, Type: n.Type, Position: n.Position, Params: map[string]any{}}
		}
	}
	return out
}
