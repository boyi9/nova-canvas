package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"nova-canvas-backend/internal/agent/mcp"
	"nova-canvas-backend/internal/agent/mcp/canvas"
)

func main() {
	transport := flag.String("transport", "stdio", "传输方式: stdio | websocket")
	flag.Int("port", 3001, "WebSocket 端口")
	flag.Bool("codex", false, "使用 Codex Agent 配置")
	flag.Bool("claude-code", false, "使用 Claude Code Agent 配置")
	flag.String("config", "", "Agent 配置文件路径")
	flag.Parse()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 创建 Canvas Bridge（演示用 Mock，实际应对接真实 Canvas 核心）
	bridge := canvas.NewMockCanvasBridge()

	// 创建 MCP Server
	server := mcp.NewServer(mcp.ServerInfo{
		Name:    "nova-canvas-mcp",
		Version: "1.0.0",
	})

	// 注册 Canvas Tools
	canvasTools := mcp.NewCanvasTools(bridge)
	canvasTools.RegisterTools(server)

	// 设置信号处理
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("[MCP] 收到关闭信号，正在退出...")
		cancel()
	}()

	// 启动传输层
	switch *transport {
	case "stdio":
		log.Println("[MCP] Server running on stdio")
		if err := server.RunStdio(ctx, os.Stdin, os.Stdout); err != nil {
			log.Fatalf("[MCP] Server error: %v", err)
		}
	case "websocket":
		// TODO: 实现 WebSocket 传输层
		log.Printf("[MCP] WebSocket transport not yet implemented, fallback to stdio")
		if err := server.RunStdio(ctx, os.Stdin, os.Stdout); err != nil {
			log.Fatalf("[MCP] Server error: %v", err)
		}
	default:
		log.Fatalf("未知传输方式: %s", *transport)
	}
}

func init() {
	// 确保标准库输出不缓冲
	flag.Parse()
}