package mcp

import (
	"encoding/json"
	"fmt"
)

const (
	ProtocolVersion = "2024-11-05"
)

// JSON-RPC 2.0 基础结构
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *JSONRPCError) Error() string {
	return fmt.Sprintf("MCP error %d: %s", e.Code, e.Message)
}

// 标准错误码
const (
	ErrorCodeParseError     = -32700
	ErrorCodeInvalidRequest = -32600
	ErrorCodeMethodNotFound = -32601
	ErrorCodeInvalidParams  = -32602
	ErrorCodeInternalError  = -32603
	ErrorCodeServerError    = -32000
)

// MCP 协议核心类型

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ServerCapabilities struct {
	Tools     *ToolsCapability     `json:"tools,omitempty"`
	Resources *ResourcesCapability `json:"resources,omitempty"`
	Prompts   *PromptsCapability   `json:"prompts,omitempty"`
}

type ToolsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type ResourcesCapability struct {
	Subscribe   bool `json:"subscribe,omitempty"`
	ListChanged bool `json:"listChanged,omitempty"`
}

type PromptsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type InitializeRequest struct {
	ProtocolVersion string                 `json:"protocolVersion"`
	Capabilities    ClientCapabilities     `json:"capabilities"`
	ClientInfo      ClientInfo             `json:"clientInfo"`
}

type ClientCapabilities struct {
	Roots    *RootsCapability    `json:"roots,omitempty"`
	Sampling *SamplingCapability `json:"sampling,omitempty"`
}

type RootsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type SamplingCapability struct{}

type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type InitializeResponse struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ServerCapabilities `json:"capabilities"`
	ServerInfo      ServerInfo         `json:"serverInfo"`
}

// Tools 相关
type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema ToolInputSchema `json:"inputSchema"`
}

type ToolInputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]PropertyDef `json:"properties,omitempty"`
	Required   []string               `json:"required,omitempty"`
}

type PropertyDef struct {
	Type        string                 `json:"type"`
	Description string                 `json:"description,omitempty"`
	Enum        []string               `json:"enum,omitempty"`
	Properties  map[string]PropertyDef `json:"properties,omitempty"`
	Required    []string               `json:"required,omitempty"`
}

type ListToolsRequest struct{}
type ListToolsResponse struct {
	Tools []Tool `json:"tools"`
}

type CallToolRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

type CallToolResponse struct {
	Content []ToolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

type ToolContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
}

func TextContent(text string) ToolContent {
	return ToolContent{Type: "text", Text: text}
}

func ImageContent(data, mimeType string) ToolContent {
	return ToolContent{Type: "image", Data: data, MIMEType: mimeType}
}

// Resources 相关
type Resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MIMEType    string `json:"mimeType,omitempty"`
}

type ListResourcesRequest struct {
	Cursor string `json:"cursor,omitempty"`
}
type ListResourcesResponse struct {
	Resources      []Resource `json:"resources"`
	NextCursor     string     `json:"nextCursor,omitempty"`
}

type ReadResourceRequest struct {
	URI string `json:"uri"`
}
type ReadResourceResponse struct {
	Contents []ResourceContent `json:"contents"`
}

type ResourceContent struct {
	URI      string `json:"uri"`
	MIMEType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}

// Prompts 相关
type Prompt struct {
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Arguments   []PromptArgument `json:"arguments,omitempty"`
}

type PromptArgument struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

type ListPromptsRequest struct {
	Cursor string `json:"cursor,omitempty"`
}
type ListPromptsResponse struct {
	Prompts    []Prompt `json:"prompts"`
	NextCursor string   `json:"nextCursor,omitempty"`
}

type GetPromptRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]string      `json:"arguments,omitempty"`
}
type GetPromptResponse struct {
	Description string         `json:"description,omitempty"`
	Messages    []PromptMessage `json:"messages"`
}

type PromptMessage struct {
	Role    string      `json:"role"`
	Content ToolContent `json:"content"`
}

// Notifications
type Notification struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

// 进度通知
type ProgressNotification struct {
	ProgressToken string  `json:"progressToken"`
	Progress      float64 `json:"progress"`
	Total         float64 `json:"total,omitempty"`
}

// 取消通知
type CancelledNotification struct {
	RequestID json.RawMessage `json:"requestId"`
	Reason    string          `json:"reason,omitempty"`
}