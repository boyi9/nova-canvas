package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"nova-canvas-backend/internal/agent/mcp/canvas"
)

type CanvasBridge interface {
	GetCurrentProject(ctx context.Context) (*canvas.Project, error)
	GetSelectedNodesWithUpstream(ctx context.Context) ([]canvas.Node, error)
	GetViewport(ctx context.Context) (*canvas.ViewportState, error)
	CreateNode(ctx context.Context, node *canvas.Node) (*canvas.Node, error)
	UpdateNode(ctx context.Context, nodeID string, updates map[string]interface{}) (*canvas.Node, error)
	DeleteNodes(ctx context.Context, nodeIDs []string) error
	ConnectNodes(ctx context.Context, conn *canvas.Connection) error
	GenerateImage(ctx context.Context, req *canvas.GenerateImageRequest) (*canvas.Node, error)
	GenerateVideo(ctx context.Context, req *canvas.GenerateVideoRequest) (*canvas.Node, error)
	ExportProject(ctx context.Context, format string, includeData bool) (interface{}, error)
	SetViewport(ctx context.Context, vp *canvas.ViewportState) error
}

type CanvasTools struct {
	bridge CanvasBridge
	mu     sync.Mutex
}

func NewCanvasTools(bridge CanvasBridge) *CanvasTools {
	return &CanvasTools{bridge: bridge}
}

func (ct *CanvasTools) RegisterTools(s *Server) {
	s.RegisterTool(Tool{
		Name:        "canvas.get_nodes",
		Description: "获取画布中所有节点或指定节点的详细信息",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"nodeIds": {
					Type:        "array",
					Description: "节点ID列表，不传则获取所有",
				},
				"includeConnections": {
					Type:        "boolean",
					Description: "是否包含连线信息",
				},
			},
		},
	}, ct.handleGetNodes)

	s.RegisterTool(Tool{
		Name:        "canvas.get_selected_nodes",
		Description: "获取当前选中的节点及其上游节点",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"includeUpstream": {
					Type:        "boolean",
					Description: "是否包含上游节点",
				},
				"upstreamDepth": {
					Type:        "integer",
					Description: "上游查找深度",
				},
			},
		},
	}, ct.handleGetSelectedNodes)

	s.RegisterTool(Tool{
		Name:        "canvas.create_node",
		Description: "在画布上创建新节点",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"type": {
					Type:        "string",
					Description: "节点类型",
					Enum:        []string{"generation", "reference", "text", "image", "video", "audio", "group", "output"},
				},
				"position": {
					Type:        "object",
					Description: "节点位置",
					Properties: map[string]PropertyDef{
						"x": {Type: "number"},
						"y": {Type: "number"},
					},
					Required: []string{"x", "y"},
				},
				"data": {
					Type:        "object",
					Description: "节点数据",
				},
				"connectTo": {
					Type:        "array",
					Description: "自动连接到的上游节点ID",
				},
			},
			Required: []string{"type", "position"},
		},
	}, ct.handleCreateNode)

	s.RegisterTool(Tool{
		Name:        "canvas.update_node",
		Description: "更新节点数据或位置",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"nodeId": {Type: "string", Description: "节点ID"},
				"data":   {Type: "object", Description: "节点数据"},
				"position": {
					Type: "object",
					Properties: map[string]PropertyDef{
						"x": {Type: "number"},
						"y": {Type: "number"},
					},
				},
				"meta": {Type: "object", Description: "节点元数据"},
			},
			Required: []string{"nodeId"},
		},
	}, ct.handleUpdateNode)

	s.RegisterTool(Tool{
		Name:        "canvas.delete_nodes",
		Description: "删除指定节点",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"nodeIds": {
					Type:        "array",
					Description: "节点ID列表",
				},
			},
			Required: []string{"nodeIds"},
		},
	}, ct.handleDeleteNodes)

	s.RegisterTool(Tool{
		Name:        "canvas.connect_nodes",
		Description: "在两个节点之间建立连接",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"sourceNodeId": {Type: "string"},
				"sourceHandle": {Type: "string"},
				"targetNodeId": {Type: "string"},
				"targetHandle": {Type: "string"},
				"type": {
					Type:        "string",
					Enum:        []string{"data", "control"},
				},
			},
			Required: []string{"sourceNodeId", "sourceHandle", "targetNodeId", "targetHandle"},
		},
	}, ct.handleConnectNodes)

	s.RegisterTool(Tool{
		Name:        "canvas.generate_image",
		Description: "调用 AI 生成图片并自动创建节点插回画布",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"prompt":          {Type: "string", Description: "生成提示词"},
				"negativePrompt":  {Type: "string", Description: "负面提示词"},
				"model":           {Type: "string", Description: "模型名称"},
				"parameters":      {Type: "object", Description: "生成参数"},
				"referenceNodeIds": {Type: "array", Description: "参考图节点ID"},
				"insertPosition": {
					Type: "object",
					Properties: map[string]PropertyDef{
						"x": {Type: "number"},
						"y": {Type: "number"},
					},
				},
			},
			Required: []string{"prompt"},
		},
	}, ct.handleGenerateImage)

	s.RegisterTool(Tool{
		Name:        "canvas.generate_video",
		Description: "调用 AI 生成视频并自动创建节点插回画布",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"prompt":          {Type: "string"},
				"model":           {Type: "string"},
				"parameters":      {Type: "object"},
				"referenceNodeIds": {Type: "array"},
				"insertPosition": {
					Type: "object",
					Properties: map[string]PropertyDef{
						"x": {Type: "number"},
						"y": {Type: "number"},
					},
				},
			},
			Required: []string{"prompt"},
		},
	}, ct.handleGenerateVideo)

	s.RegisterTool(Tool{
		Name:        "canvas.export_project",
		Description: "导出当前画布项目",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"format": {
					Type:        "string",
					Enum:        []string{"json", "png", "pdf"},
					Description: "导出格式",
				},
				"includeData": {
					Type:        "boolean",
					Description: "是否包含节点数据",
				},
			},
		},
	}, ct.handleExportProject)

	s.RegisterTool(Tool{
		Name:        "canvas.get_viewport",
		Description: "获取当前视口状态",
		InputSchema: ToolInputSchema{Type: "object"},
	}, ct.handleGetViewport)

	s.RegisterTool(Tool{
		Name:        "canvas.set_viewport",
		Description: "设置视口状态（平移、缩放、旋转）",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"x":      {Type: "number"},
				"y":      {Type: "number"},
				"zoom":   {Type: "number"},
				"rotation": {Type: "number"},
			},
		},
	}, ct.handleSetViewport)
}

func (ct *CanvasTools) handleGetNodes(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	nodeIDs, _ := args["nodeIds"].([]interface{})
	includeConn, _ := args["includeConnections"].(bool)

	var ids []string
	for _, v := range nodeIDs {
		if s, ok := v.(string); ok {
			ids = append(ids, s)
		}
	}

	project, err := ct.bridge.GetCurrentProject(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取项目失败: %w", err)
	}

	var nodes []canvas.Node
	if len(ids) == 0 {
		nodes = project.Nodes
	} else {
		nodeMap := make(map[string]canvas.Node)
		for _, n := range project.Nodes {
			nodeMap[n.ID] = n
		}
		for _, id := range ids {
			if n, ok := nodeMap[id]; ok {
				nodes = append(nodes, n)
			}
		}
	}

	result := map[string]interface{}{"nodes": nodes}
	if includeConn {
		result["connections"] = project.Connections
	}

	data, _ := json.Marshal(result)
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleGetSelectedNodes(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	includeUpstream, _ := args["includeUpstream"].(bool)
	upstreamDepth := int(args["upstreamDepth"].(float64))
	if upstreamDepth == 0 {
		upstreamDepth = 3
	}

	nodes, err := ct.bridge.GetSelectedNodesWithUpstream(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取选中节点失败: %w", err)
	}

	result := map[string]interface{}{"nodes": nodes}
	if includeUpstream {
		result["upstreamNodes"] = nodes
	}

	data, _ := json.Marshal(result)
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleCreateNode(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	nodeType, _ := args["type"].(string)
	pos, _ := args["position"].(map[string]interface{})
	data, _ := args["data"].(map[string]interface{})
	connectTo, _ := args["connectTo"].([]interface{})

	x, _ := pos["x"].(float64)
	y, _ := pos["y"].(float64)

	node := &canvas.Node{
		Type: canvas.NodeType(nodeType),
		Position: canvas.Point{X: x, Y: y},
		Size:   canvas.Size{Width: 300, Height: 300},
		Data:   data,
		Meta: canvas.NodeMeta{
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
			Version:   1,
			Tags:      []string{},
			IsLocked:  false,
			IsHidden:  false,
		},
	}

	created, err := ct.bridge.CreateNode(ctx, node)
	if err != nil {
		return nil, fmt.Errorf("创建节点失败: %w", err)
	}

	if len(connectTo) > 0 {
		for _, v := range connectTo {
			if targetID, ok := v.(string); ok {
				conn := &canvas.Connection{
					SourceNodeID: targetID,
					SourceHandle: "output",
					TargetNodeID: created.ID,
					TargetHandle: "input",
					Type:         "data",
				}
				_ = ct.bridge.ConnectNodes(ctx, conn)
			}
		}
	}

	data, _ := json.Marshal(map[string]interface{}{"success": true, "node": created})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleUpdateNode(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	nodeID, _ := args["nodeId"].(string)
	data, _ := args["data"].(map[string]interface{})
	pos, _ := args["position"].(map[string]interface{})
	meta, _ := args["meta"].(map[string]interface{})

	updates := make(map[string]interface{})
	if data != nil {
		updates["data"] = data
	}
	if pos != nil {
		updates["position"] = pos
	}
	if meta != nil {
		updates["meta"] = meta
	}
	updates["updatedAt"] = time.Now().UnixMilli()

	updated, err := ct.bridge.UpdateNode(ctx, nodeID, updates)
	if err != nil {
		return nil, fmt.Errorf("更新节点失败: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{"success": true, "node": updated})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleDeleteNodes(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	nodeIDs, _ := args["nodeIds"].([]interface{})
	var ids []string
	for _, v := range nodeIDs {
		if s, ok := v.(string); ok {
			ids = append(ids, s)
		}
	}

	err := ct.bridge.DeleteNodes(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("删除节点失败: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{"success": true, "deletedCount": len(ids)})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleConnectNodes(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	conn := &canvas.Connection{
		SourceNodeID: args["sourceNodeId"].(string),
		SourceHandle: args["sourceHandle"].(string),
		TargetNodeID: args["targetNodeId"].(string),
		TargetHandle: args["targetHandle"].(string),
		Type:         args["type"].(string),
	}

	err := ct.bridge.ConnectNodes(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("建立连接失败: %w", err)
	}

	return []ToolContent{{Type: "text", Text: `{"success": true}`}}, nil
}

func (ct *CanvasTools) handleGenerateImage(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	req := &canvas.GenerateImageRequest{
		Prompt:           args["prompt"].(string),
		NegativePrompt:   getString(args, "negativePrompt"),
		Model:            getString(args, "model"),
		Parameters:       getMap(args, "parameters"),
		ReferenceNodeIDs: getStringSlice(args, "referenceNodeIds"),
		InsertPosition:   getPoint(args, "insertPosition"),
	}

	node, err := ct.bridge.GenerateImage(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("生成图片失败: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{"success": true, "node": node, "message": "图片生成完成并已插回画布"})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleGenerateVideo(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	req := &canvas.GenerateVideoRequest{
		Prompt:           args["prompt"].(string),
		Model:            getString(args, "model"),
		Parameters:       getMap(args, "parameters"),
		ReferenceNodeIDs: getStringSlice(args, "referenceNodeIds"),
		InsertPosition:   getPoint(args, "insertPosition"),
	}

	node, err := ct.bridge.GenerateVideo(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("生成视频失败: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{"success": true, "node": node, "message": "视频生成完成并已插回画布"})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleExportProject(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	format := getString(args, "format")
	if format == "" {
		format = "json"
	}
	includeData, _ := args["includeData"].(bool)

	data, err := ct.bridge.ExportProject(ctx, format, includeData)
	if err != nil {
		return nil, fmt.Errorf("导出项目失败: %w", err)
	}

	result, _ := json.Marshal(map[string]interface{}{"success": true, "format": format, "data": data})
	return []ToolContent{{Type: "text", Text: string(result)}}, nil
}

func (ct *CanvasTools) handleGetViewport(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	vp, err := ct.bridge.GetViewport(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取视口失败: %w", err)
	}
	data, _ := json.Marshal(vp)
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func (ct *CanvasTools) handleSetViewport(ctx context.Context, args map[string]interface{}) ([]ToolContent, error) {
	vp := &canvas.ViewportState{
		X:      getFloat64(args, "x"),
		Y:      getFloat64(args, "y"),
		Zoom:   getFloat64(args, "zoom"),
		Rotation: getFloat64(args, "rotation"),
	}
	err := ct.bridge.SetViewport(ctx, vp)
	if err != nil {
		return nil, fmt.Errorf("设置视口失败: %w", err)
	}
	data, _ := json.Marshal(map[string]interface{}{"success": true, "viewport": vp})
	return []ToolContent{{Type: "text", Text: string(data)}}, nil
}

func getString(args map[string]interface{}, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func getFloat64(args map[string]interface{}, key string) float64 {
	if v, ok := args[key].(float64); ok {
		return v
	}
	return 0
}

func getMap(args map[string]interface{}, key string) map[string]interface{} {
	if v, ok := args[key].(map[string]interface{}); ok {
		return v
	}
	return nil
}

func getStringSlice(args map[string]interface{}, key string) []string {
	var result []string
	if v, ok := args[key].([]interface{}); ok {
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
	}
	return result
}

func getPoint(args map[string]interface{}, key string) *canvas.Point {
	if v, ok := args[key].(map[string]interface{}); ok {
		return &canvas.Point{
			X: getFloat64(v, "x"),
			Y: getFloat64(v, "y"),
		}
	}
	return nil
}