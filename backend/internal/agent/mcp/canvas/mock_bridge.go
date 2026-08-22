package canvas

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

type MockCanvasBridge struct {
	mu      sync.RWMutex
	project *Project
}

func NewMockCanvasBridge() *MockCanvasBridge {
	bridge := &MockCanvasBridge{}
	bridge.project = bridge.createDemoProject()
	return bridge
}

func (b *MockCanvasBridge) createDemoProject() *Project {
	now := time.Now().UnixMilli()
	return &Project{
		ID:      "demo-project-001",
		Name:    "Nova Canvas Demo Project",
		Version: "1.0.0",
		Nodes: []Node{
			{
				ID: "node-ref-001",
				Type: NodeTypeReference,
				Position: Point{X: 100, Y: 100},
				Size: Size{Width: 300, Height: 300},
				Data: map[string]interface{}{
					"imageUrl": "https://picsum.photos/seed/reference1/512/512",
					"prompt":   "A beautiful sunset over mountains, photorealistic",
				},
				Meta: NodeMeta{
					CreatedAt: now - 3600000,
					UpdatedAt: now - 3600000,
					Version:   1,
					Tags:      []string{"reference", "landscape"},
					IsLocked:  false,
					IsHidden:  false,
				},
				Connections: []Connection{},
			},
			{
				ID: "node-gen-001",
				Type: NodeTypeGeneration,
				Position: Point{X: 500, Y: 100},
				Size: Size{Width: 300, Height: 300},
				Data: map[string]interface{}{
					"prompt":  "Sunset over mountains, oil painting style, vibrant colors",
					"model":   "seedream-5.0",
					"parameters": map[string]interface{}{
						"steps":     30,
						"cfgScale":  7.5,
						"width":     1024,
						"height":    1024,
					},
				},
				Meta: NodeMeta{
					CreatedAt: now - 1800000,
					UpdatedAt: now - 1800000,
					Version:   1,
					Tags:      []string{"generated", "oil-painting"},
					IsLocked:  false,
					IsHidden:  false,
				},
				Connections: []Connection{
					{
						ID:            "conn-001",
						SourceNodeID:  "node-ref-001",
						SourceHandle:  "output",
						TargetNodeID:  "node-gen-001",
						TargetHandle:  "reference",
						Type:          "data",
					},
				},
			},
			{
				ID: "node-text-001",
				Type: NodeTypeText,
				Position: Point{X: 100, Y: 500},
				Size: Size{Width: 400, Height: 100},
				Data: map[string]interface{}{
					"textContent": "品牌主视觉设计方案 v1.0\n核心概念：自然与科技的融合",
				},
				Meta: NodeMeta{
					CreatedAt: now - 600000,
					UpdatedAt: now - 600000,
					Version:   1,
					Tags:      []string{"brief", "brand"},
					IsLocked:  false,
					IsHidden:  false,
				},
				Connections: []Connection{},
			},
		},
		Connections: []Connection{
			{
				ID:            "conn-001",
				SourceNodeID:  "node-ref-001",
				SourceHandle:  "output",
				TargetNodeID:  "node-gen-001",
				TargetHandle:  "reference",
				Type:          "data",
			},
		},
		Viewport: ViewportState{
			X: 0, Y: 0, Zoom: 1, Rotation: 0,
		},
		Meta: ProjectMeta{
			CreatedAt:   now - 7200000,
			UpdatedAt:   now,
			Author:      "demo-user",
			Tags:        []string{"demo", "brand-design"},
			Description: "演示项目：品牌主视觉设计流程",
		},
	}
}

func (b *MockCanvasBridge) GetCurrentProject(ctx context.Context) (*Project, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	// 返回副本
	proj := *b.project
	return &proj, nil
}

func (b *MockCanvasBridge) GetSelectedNodesWithUpstream(ctx context.Context) ([]Node, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// 模拟：返回第一个 generation 类型节点作为选中
	var selected []Node
	for _, n := range b.project.Nodes {
		if n.Type == NodeTypeGeneration {
			selected = append(selected, n)
		}
	}

	result := make([]Node, len(selected))
	copy(result, selected)

	// 添加上游节点
	for _, node := range selected {
		upstream := b.getUpstreamNodesLocked(node.ID, 3)
		result = append(result, upstream...)
	}

	// 去重
	unique := make(map[string]Node)
	for _, n := range result {
		unique[n.ID] = n
	}
	final := make([]Node, 0, len(unique))
	for _, n := range unique {
		final = append(final, n)
	}
	return final, nil
}

func (b *MockCanvasBridge) getUpstreamNodesLocked(nodeID string, depth int) []Node {
	visited := make(map[string]bool)
	var result []Node

	var traverse func(string, int)
	traverse = func(currentID string, currentDepth int) {
		if currentDepth > depth || visited[currentID] {
			return
		}
		visited[currentID] = true

		for _, conn := range b.project.Connections {
			if conn.TargetNodeID == currentID {
				for _, n := range b.project.Nodes {
					if n.ID == conn.SourceNodeID {
						result = append(result, n)
						traverse(conn.SourceNodeID, currentDepth+1)
						break
					}
				}
			}
		}
	}
	traverse(nodeID, 1)
	return result
}

func (b *MockCanvasBridge) GetViewport(ctx context.Context) (*ViewportState, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	vp := b.project.Viewport
	return &vp, nil
}

func (b *MockCanvasBridge) CreateNode(ctx context.Context, node *Node) (*Node, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	newNode := *node
	newNode.ID = "node-" + uuid.New().String()[:8]
	b.project.Nodes = append(b.project.Nodes, newNode)
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	return &newNode, nil
}

func (b *MockCanvasBridge) UpdateNode(ctx context.Context, nodeID string, updates map[string]interface{}) (*Node, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i, n := range b.project.Nodes {
		if n.ID == nodeID {
			if data, ok := updates["data"].(map[string]interface{}); ok {
				b.project.Nodes[i].Data = data
			}
			if pos, ok := updates["position"].(map[string]interface{}); ok {
				if x, ok := pos["x"].(float64); ok {
					b.project.Nodes[i].Position.X = x
				}
				if y, ok := pos["y"].(float64); ok {
					b.project.Nodes[i].Position.Y = y
				}
			}
			if meta, ok := updates["meta"].(map[string]interface{}); ok {
				if tags, ok := meta["tags"].([]interface{}); ok {
					t := make([]string, len(tags))
					for i, v := range tags {
						if s, ok := v.(string); ok {
							t[i] = s
						}
					}
					b.project.Nodes[i].Meta.Tags = t
				}
			}
			if updatedAt, ok := updates["updatedAt"].(int64); ok {
				b.project.Nodes[i].Meta.UpdatedAt = updatedAt
			} else {
				b.project.Nodes[i].Meta.UpdatedAt = time.Now().UnixMilli()
			}
			b.project.Meta.UpdatedAt = time.Now().UnixMilli()
			updated := b.project.Nodes[i]
			return &updated, nil
		}
	}
	return nil, nil
}

func (b *MockCanvasBridge) DeleteNodes(ctx context.Context, nodeIDs []string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	idSet := make(map[string]bool)
	for _, id := range nodeIDs {
		idSet[id] = true
	}

	newNodes := make([]Node, 0)
	for _, n := range b.project.Nodes {
		if !idSet[n.ID] {
			newNodes = append(newNodes, n)
		}
	}
	b.project.Nodes = newNodes

	newConns := make([]Connection, 0)
	for _, c := range b.project.Connections {
		if !idSet[c.SourceNodeID] && !idSet[c.TargetNodeID] {
			newConns = append(newConns, c)
		}
	}
	b.project.Connections = newConns
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	return nil
}

func (b *MockCanvasBridge) ConnectNodes(ctx context.Context, conn *Connection) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	conn.ID = "conn-" + uuid.New().String()[:8]
	b.project.Connections = append(b.project.Connections, *conn)
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	return nil
}

func (b *MockCanvasBridge) GenerateImage(ctx context.Context, req *GenerateImageRequest) (*Node, error) {
	// 模拟生成延迟
	time.Sleep(100 * time.Millisecond)

	position := Point{X: 900, Y: 100}
	if req.InsertPosition != nil {
		position = *req.InsertPosition
	}

	resultURL := "https://picsum.photos/seed/" + uuid.New().String() + "/1024/1024"

	node := &Node{
		ID: "node-" + uuid.New().String()[:8],
		Type: NodeTypeGeneration,
		Position: position,
		Size: Size{Width: 300, Height: 300},
		Data: map[string]interface{}{
			"prompt":         req.Prompt,
			"negativePrompt": req.NegativePrompt,
			"model":          req.Model,
			"parameters":     req.Parameters,
			"imageUrl":       resultURL,
			"result": GenerationResult{
				Type:        "image",
				URL:         resultURL,
				MIMEType:    "image/png",
				Size:        1024 * 1024,
				Metadata:    req.Parameters,
				GeneratedAt: time.Now().UnixMilli(),
			},
		},
		Meta: NodeMeta{
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
			Version:   1,
			Tags:      []string{"generated", "image"},
			IsLocked:  false,
			IsHidden:  false,
		},
		Connections: []Connection{},
	}

	b.mu.Lock()
	b.project.Nodes = append(b.project.Nodes, *node)
	if len(req.ReferenceNodeIDs) > 0 {
		for _, refID := range req.ReferenceNodeIDs {
			b.project.Connections = append(b.project.Connections, Connection{
				ID:            "conn-" + uuid.New().String()[:8],
				SourceNodeID:  refID,
				SourceHandle:  "output",
				TargetNodeID:  node.ID,
				TargetHandle:  "reference",
				Type:          "data",
			})
		}
	}
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	b.mu.Unlock()

	return node, nil
}

func (b *MockCanvasBridge) GenerateVideo(ctx context.Context, req *GenerateVideoRequest) (*Node, error) {
	time.Sleep(100 * time.Millisecond)

	position := Point{X: 900, Y: 500}
	if req.InsertPosition != nil {
		position = *req.InsertPosition
	}

	resultURL := "https://example.com/videos/" + uuid.New().String() + ".mp4"

	node := &Node{
		ID: "node-" + uuid.New().String()[:8],
		Type: NodeTypeGeneration,
		Position: position,
		Size: Size{Width: 300, Height: 200},
		Data: map[string]interface{}{
			"prompt":     req.Prompt,
			"model":      req.Model,
			"parameters": req.Parameters,
			"videoUrl":   resultURL,
			"result": GenerationResult{
				Type:        "video",
				URL:         resultURL,
				MIMEType:    "video/mp4",
				Size:        5 * 1024 * 1024,
				Metadata:    req.Parameters,
				GeneratedAt: time.Now().UnixMilli(),
			},
		},
		Meta: NodeMeta{
			CreatedAt: time.Now().UnixMilli(),
			UpdatedAt: time.Now().UnixMilli(),
			Version:   1,
			Tags:      []string{"generated", "video"},
			IsLocked:  false,
			IsHidden:  false,
		},
		Connections: []Connection{},
	}

	b.mu.Lock()
	b.project.Nodes = append(b.project.Nodes, *node)
	if len(req.ReferenceNodeIDs) > 0 {
		for _, refID := range req.ReferenceNodeIDs {
			b.project.Connections = append(b.project.Connections, Connection{
				ID:            "conn-" + uuid.New().String()[:8],
				SourceNodeID:  refID,
				SourceHandle:  "output",
				TargetNodeID:  node.ID,
				TargetHandle:  "reference",
				Type:          "data",
			})
		}
	}
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	b.mu.Unlock()

	return node, nil
}

func (b *MockCanvasBridge) ExportProject(ctx context.Context, format string, includeData bool) (interface{}, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if format == "json" || format == "" {
		if includeData {
			return b.project, nil
		}
		proj := *b.project
		proj.Nodes = nil
		proj.Connections = nil
		return proj, nil
	}

	return map[string]interface{}{
		"success": false,
		"message": format + " 导出需要前端 Canvas 渲染配合，请在前端调用导出 API",
		"projectId": b.project.ID,
	}, nil
}

func (b *MockCanvasBridge) SetViewport(ctx context.Context, vp *ViewportState) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.project.Viewport = *vp
	b.project.Meta.UpdatedAt = time.Now().UnixMilli()
	return nil
}