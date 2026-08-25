package workflow

import (
	"context"
	"fmt"
	"strings"
)

// DefaultRegistry returns an engine preloaded with handlers for the built-in
// canvas node types. Handlers are deterministic so the engine is testable and
// runs without external services; LLM-backed variants can be registered to
// override these for live generation.
func DefaultRegistry() *Engine {
	e := NewEngine()
	e.Register("text", echoHandler)
	e.Register("nova_text", echoHandler)
	e.Register("image", echoHandler)
	e.Register("video", echoHandler)
	e.Register("audio", echoHandler)
	e.Register("config", echoHandler)
	e.Register("multimodal", multimodalHandler)
	e.Register("product", productHandler)
	e.Register("storyboard", storyboardHandler)
	e.Register("video_track", videoTrackHandler)
	e.Register("recipe", recipeHandler)
	return e
}

func echoHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	out := map[string]any{}
	for k, v := range n.Params {
		out[k] = v
	}
	return out, nil
}

func multimodalHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	mods, _ := n.Params["modalities"].([]any)
	return map[string]any{"modalities": mods}, nil
}

func productHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	name, _ := n.Params["productName"].(string)
	price, _ := n.Params["price"].(string)
	points, _ := n.Params["sellingPoints"].([]any)
	brief := fmt.Sprintf("商品《%s》 价格%s 卖点:%s", name, price, strings.Join(anySliceToStrings(points), "、"))
	return map[string]any{
		"name":          name,
		"price":         price,
		"sellingPoints": points,
		"brief":         brief,
	}, nil
}

func storyboardHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	scenes, _ := n.Params["scenes"].([]any)
	for src, out := range inputs {
		if om, ok := out.(map[string]any); ok {
			if brief, ok := om["brief"].(string); ok && brief != "" {
				scenes = append([]any{fmt.Sprintf("[源自%s] %s", src, brief)}, scenes...)
			}
		}
	}
	return map[string]any{"scenes": scenes}, nil
}

func videoTrackHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	clips, _ := n.Params["clips"].([]any)
	duration := n.Params["duration"]
	return map[string]any{"clips": clips, "duration": duration}, nil
}

func recipeHandler(ctx context.Context, n Node, inputs map[string]any, variables map[string]any) (map[string]any, error) {
	name, _ := n.Params["recipeName"].(string)
	params, _ := n.Params["params"].(map[string]any)
	return map[string]any{"recipeName": name, "params": params}, nil
}

func anySliceToStrings(in []any) []string {
	out := make([]string, 0, len(in))
	for _, v := range in {
		out = append(out, fmt.Sprintf("%v", v))
	}
	return out
}
