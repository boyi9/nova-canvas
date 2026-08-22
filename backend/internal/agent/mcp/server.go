package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"
)

type ToolHandler func(ctx context.Context, args map[string]interface{}) ([]ToolContent, error)
type ResourceHandler func(ctx context.Context, uri string) ([]ResourceContent, error)
type PromptHandler func(ctx context.Context, name string, args map[string]string) (*GetPromptResponse, error)

type Server struct {
	info         ServerInfo
	capabilities ServerCapabilities
	tools        map[string]Tool
	toolHandlers map[string]ToolHandler
	resources    map[string]Resource
	resHandlers  map[string]ResourceHandler
	prompts      map[string]Prompt
	promptHandlers map[string]PromptHandler
	mu           sync.RWMutex
}

func NewServer(info ServerInfo) *Server {
	return &Server{
		info: info,
		capabilities: ServerCapabilities{
			Tools: &ToolsCapability{ListChanged: true},
		},
		tools:          make(map[string]Tool),
		toolHandlers:   make(map[string]ToolHandler),
		resources:      make(map[string]Resource),
		resHandlers:    make(map[string]ResourceHandler),
		prompts:        make(map[string]Prompt),
		promptHandlers: make(map[string]PromptHandler),
	}
}

func (s *Server) RegisterTool(tool Tool, handler ToolHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tools[tool.Name] = tool
	s.toolHandlers[tool.Name] = handler
}

func (s *Server) RegisterResource(resource Resource, handler ResourceHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resources[resource.URI] = resource
	s.resHandlers[resource.URI] = handler
}

func (s *Server) RegisterPrompt(prompt Prompt, handler PromptHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.prompts[prompt.Name] = prompt
	s.promptHandlers[prompt.Name] = handler
}

func (s *Server) ListTools() []Tool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tools := make([]Tool, 0, len(s.tools))
	for _, t := range s.tools {
		tools = append(tools, t)
	}
	return tools
}

func (s *Server) Handle(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	// 通知无需回包
	if msg.Method != "" && (len(msg.Method) > 13 && msg.Method[:13] == "notifications/") {
		return nil, nil
	}

	switch msg.Method {
	case "initialize":
		return s.handleInitialize(ctx, msg)
	case "ping":
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Result:  json.RawMessage(`{}`),
		}, nil
	case "tools/list":
		return s.handleToolsList(ctx, msg)
	case "tools/call":
		return s.handleToolCall(ctx, msg)
	case "resources/list":
		return s.handleResourcesList(ctx, msg)
	case "resources/read":
		return s.handleResourceRead(ctx, msg)
	case "prompts/list":
		return s.handlePromptsList(ctx, msg)
	case "prompts/get":
		return s.handlePromptGet(ctx, msg)
	default:
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error: &JSONRPCError{
				Code:    ErrorCodeMethodNotFound,
				Message: fmt.Sprintf("方法未实现: %s", msg.Method),
			},
		}, nil
	}
}

func (s *Server) handleInitialize(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	var req InitializeRequest
	if len(msg.Params) > 0 {
		if err := json.Unmarshal(msg.Params, &req); err != nil {
			return &JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error:   &JSONRPCError{Code: ErrorCodeInvalidParams, Message: err.Error()},
			}, nil
		}
	}

	resp := InitializeResponse{
		ProtocolVersion: ProtocolVersion,
		Capabilities:    s.capabilities,
		ServerInfo:      s.info,
	}

	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handleToolsList(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	tools := s.ListTools()
	resp := ListToolsResponse{Tools: tools}
	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handleToolCall(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	var req CallToolRequest
	if len(msg.Params) > 0 {
		if err := json.Unmarshal(msg.Params, &req); err != nil {
			return &JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error:   &JSONRPCError{Code: ErrorCodeInvalidParams, Message: err.Error()},
			}, nil
		}
	}

	s.mu.RLock()
	handler, ok := s.toolHandlers[req.Name]
	s.mu.RUnlock()

	if !ok {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeMethodNotFound, Message: fmt.Sprintf("未知工具: %s", req.Name)},
		}, nil
	}

	content, err := handler(ctx, req.Arguments)
	if err != nil {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeServerError, Message: err.Error()},
		}, nil
	}

	resp := CallToolResponse{Content: content, IsError: false}
	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handleResourcesList(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	resources := make([]Resource, 0, len(s.resources))
	for _, r := range s.resources {
		resources = append(resources, r)
	}

	resp := ListResourcesResponse{Resources: resources}
	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handleResourceRead(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	var req ReadResourceRequest
	if len(msg.Params) > 0 {
		if err := json.Unmarshal(msg.Params, &req); err != nil {
			return &JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error:   &JSONRPCError{Code: ErrorCodeInvalidParams, Message: err.Error()},
			}, nil
		}
	}

	s.mu.RLock()
	handler, ok := s.resHandlers[req.URI]
	s.mu.RUnlock()

	if !ok {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeMethodNotFound, Message: fmt.Sprintf("未知资源: %s", req.URI)},
		}, nil
	}

	content, err := handler(ctx, req.URI)
	if err != nil {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeServerError, Message: err.Error()},
		}, nil
	}

	resp := ReadResourceResponse{Contents: content}
	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handlePromptsList(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	prompts := make([]Prompt, 0, len(s.prompts))
	for _, p := range s.prompts {
		prompts = append(prompts, p)
	}

	resp := ListPromptsResponse{Prompts: prompts}
	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) handlePromptGet(ctx context.Context, msg JSONRPCRequest) (*JSONRPCResponse, error) {
	var req GetPromptRequest
	if len(msg.Params) > 0 {
		if err := json.Unmarshal(msg.Params, &req); err != nil {
			return &JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      msg.ID,
				Error:   &JSONRPCError{Code: ErrorCodeInvalidParams, Message: err.Error()},
			}, nil
		}
	}

	s.mu.RLock()
	handler, ok := s.promptHandlers[req.Name]
	s.mu.RUnlock()

	if !ok {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeMethodNotFound, Message: fmt.Sprintf("未知提示: %s", req.Name)},
		}, nil
	}

	resp, err := handler(ctx, req.Name, req.Arguments)
	if err != nil {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error:   &JSONRPCError{Code: ErrorCodeServerError, Message: err.Error()},
		}, nil
	}

	result, _ := json.Marshal(resp)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  result,
	}, nil
}

func (s *Server) RunStdio(ctx context.Context, stdin io.Reader, stdout io.Writer) error {
	decoder := json.NewDecoder(stdin)
	encoder := json.NewEncoder(stdout)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			var msg JSONRPCRequest
			if err := decoder.Decode(&msg); err != nil {
				if err == io.EOF {
					return nil
				}
				continue
			}

			resp, err := s.Handle(ctx, msg)
			if err != nil {
				continue
			}
			if resp != nil {
				if err := encoder.Encode(resp); err != nil {
					return err
				}
			}
		}
	}
}

type CircuitBreaker struct {
	name       string
	failures   int
	threshold  int
	timeout    time.Duration
	lastFail   time.Time
	mu         sync.Mutex
}

func NewCircuitBreaker(name string, threshold int, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		name:      name,
		threshold: threshold,
		timeout:   timeout,
	}
}

func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.mu.Lock()
	if cb.failures >= cb.threshold {
		if time.Since(cb.lastFail) < cb.timeout {
			cb.mu.Unlock()
			return fmt.Errorf("circuit breaker %s open", cb.name)
		}
		cb.failures = 0
	}
	cb.mu.Unlock()

	err := fn()
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if err != nil {
		cb.failures++
		cb.lastFail = time.Now()
	} else {
		cb.failures = 0
	}
	return err
}

func (cb *CircuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures = 0
}