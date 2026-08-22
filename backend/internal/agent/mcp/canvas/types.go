package canvas

import "time"

type NodeType string

const (
	NodeTypeGeneration NodeType = "generation"
	NodeTypeReference  NodeType = "reference"
	NodeTypeText       NodeType = "text"
	NodeTypeImage      NodeType = "image"
	NodeTypeVideo      NodeType = "video"
	NodeTypeAudio      NodeType = "audio"
	NodeTypeGroup      NodeType = "group"
	NodeTypeOutput     NodeType = "output"
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Size struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type NodeMeta struct {
	CreatedAt int64    `json:"createdAt"`
	UpdatedAt int64    `json:"updatedAt"`
	Version   int      `json:"version"`
	Tags      []string `json:"tags"`
	IsLocked  bool     `json:"isLocked"`
	IsHidden  bool     `json:"isHidden"`
}

type Connection struct {
	ID              string `json:"id"`
	SourceNodeID    string `json:"sourceNodeId"`
	SourceHandle    string `json:"sourceHandle"`
	TargetNodeID    string `json:"targetNodeId"`
	TargetHandle    string `json:"targetHandle"`
	Type            string `json:"type"` // data | control
}

type Node struct {
	ID          string                 `json:"id"`
	Type        NodeType               `json:"type"`
	Position    Point                  `json:"position"`
	Size        Size                   `json:"size"`
	Data        map[string]interface{} `json:"data"`
	Meta        NodeMeta               `json:"meta"`
	Connections []Connection           `json:"connections"`
}

type ViewportState struct {
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Zoom    float64 `json:"zoom"`
	Rotation float64 `json:"rotation"`
}

type ProjectMeta struct {
	CreatedAt  int64    `json:"createdAt"`
	UpdatedAt  int64    `json:"updatedAt"`
	Author     string   `json:"author"`
	Tags       []string `json:"tags"`
	Description string  `json:"description"`
}

type Project struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	Version    string       `json:"version"`
	Nodes      []Node       `json:"nodes"`
	Connections []Connection `json:"connections"`
	Viewport   ViewportState `json:"viewport"`
	Meta       ProjectMeta  `json:"meta"`
}

type GenerateImageRequest struct {
	Prompt           string                 `json:"prompt"`
	NegativePrompt   string                 `json:"negativePrompt"`
	Model            string                 `json:"model"`
	Parameters       map[string]interface{} `json:"parameters"`
	ReferenceNodeIDs []string               `json:"referenceNodeIds"`
	InsertPosition   *Point                 `json:"insertPosition"`
}

type GenerateVideoRequest struct {
	Prompt           string                 `json:"prompt"`
	Model            string                 `json:"model"`
	Parameters       map[string]interface{} `json:"parameters"`
	ReferenceNodeIDs []string               `json:"referenceNodeIds"`
	InsertPosition   *Point                 `json:"insertPosition"`
}

type GenerationResult struct {
	Type       string                 `json:"type"` // image | video | audio | text
	URL        string                 `json:"url"`
	MIMEType   string                 `json:"mimeType"`
	Size       int64                  `json:"size"`
	Metadata   map[string]interface{} `json:"metadata"`
	GeneratedAt int64                 `json:"generatedAt"`
}