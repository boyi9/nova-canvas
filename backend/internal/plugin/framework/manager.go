package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ============ 插件元数据 ============

type PluginMeta struct {
	ID          string `json:"id"`        // 插件唯一标识
	Name        string `json:"name"`      // 插件名称
	Version     string `json:"version"`   // 插件版本
	Description string `json:"description"` // 插件描述
	Author      string `json:"author"`    // 插件作者
	EntryPoint  string `json:"entryPoint"` // 入口文件路径（相对于插件根目录）
	APIVersion  string `json:"apiVersion"` // 兼容的 API 版本
	Enabled     bool   `json:"enabled"`   // 是否启用
	// Type       string `json:"type"`      // 插件类型：node-operation, visualization, etc.
}

// ============ 插件状态 ============

type PluginState int

const (
	PluginStateDisabled PluginState = iota
	PluginStateEnabled
	PluginStateUpdating
	PluginStateUninstalling
)

func (ps PluginState) String() string {
	switch ps {
	case PluginStateDisabled:
		return "disabled"
	case PluginStateEnabled:
		return "enabled"
	case PluginStateUpdating:
		return "updating"
	case PluginStateUninstalling:
		return "uninstalling"
	}
	return "unknown"
}

// ============ 插件框架配置 ============

type FrameworkConfig struct {
	PluginDir      string            `json:"pluginDir"`       // 插件目录
	AutoReload     bool              `json:"autoReload"`      // 自动热重载
	MaxRetries     int               `json:"maxRetries"`      // 最大重试次数
	TimeoutSeconds int               `json:"timeoutSeconds"`  // 超时时间
}

// ============ 插件管理器 ============

type PluginManager struct {
	config      FrameworkConfig
	plugins     map[string]*PluginMeta
	pluginObjs  map[string]interface{} // 已加载的插件实例
	handlers    map[string][]Handler   // 已注册的事件处理器
	mu          sync.RWMutex
	circuitBreaker *CircuitBreaker
}

// CircuitBreaker for plugin operations
type CircuitBreaker struct {
	failures   int
	threshold  int
	timeout    time.Duration
	lastFail   time.Time
	mu         sync.Mutex
}

func NewCircuitBreaker(threshold int, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		threshold: threshold,
		timeout:   timeout,
	}
}

func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.mu.Lock()
	if cb.failures >= cb.threshold {
		if time.Since(cb.lastFail) < cb.timeout {
			cb.mu.Unlock()
			return fmt.Errorf("plugin circuit breaker open, failures: %d", cb.failures)
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

// Handler 类型：插件事件处理器
type Handler func(ctx context.Context, payload interface{}) error

// Plugin 管理器方法扩展

func NewPluginManager(config FrameworkConfig) *PluginManager {
	return &PluginManager{
		config:      config,
		plugins:     make(map[string]*PluginMeta),
		pluginObjs:  make(map[string]interface{}),
		handlers:    make(map[string][]Handler),
		circuitBreaker: NewCircuitBreaker(3, 30*time.Second),
	}
}

// RegisterHandler 注册事件处理器
func (pm *PluginManager) RegisterHandler(event string, handler Handler) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.handlers[event] = append(pm.handlers[event], handler)
}

// emitEvent 触发事件（内部使用）
func (pm *PluginManager) emitEvent(ctx context.Context, event string, payload interface{}) error {
	pm.mu.RLock()
	handlers := pm.handlers[event]
	pm.mu.RUnlock()

	for _, handler := range handlers {
		if err := handler(ctx, payload); err != nil {
			// 错误不中断其他处理器
			_ = err
		}
	}
	return nil
}

// ============ 插件安装与管理

// InstallPluginFromURL 从 URL 安装插件
func (pm *PluginManager) InstallPluginFromURL(ctx context.Context, url string) (*PluginMeta, error) {
	_ = ctx // 预留，实际可用于超时控制
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// 下载插件包
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("下载插件失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("插件下载返回非 200: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取插件包失败: %w", err)
	}

	// 解析 plugin.json
	var meta PluginMeta
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, fmt.Errorf("解析插件元数据失败: %w", err)
	}

	// 检查是否已存在
	if _, exists := pm.plugins[meta.ID]; exists {
		return nil, fmt.Errorf("插件已存在: %s", meta.ID)
	}

	// 安全检查：验证入口文件是否存在
	pluginDir := filepath.Join(pm.config.PluginDir, meta.ID)
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		return nil, fmt.Errorf("创建插件目录失败: %w", err)
	}

	// 验证入口文件
	entryPath := filepath.Join(pluginDir, meta.EntryPoint)
	if _, err := os.Stat(entryPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("插件入口文件不存在: %s", entryPath)
	}

	pm.plugins[meta.ID] = &meta
	fmt.Printf("[Plugin] 插件已注册: %s (v%s)\n", meta.Name, meta.Version)
	return &meta, nil
}

// EnablePlugin 启用插件
func (pm *PluginManager) EnablePlugin(ctx context.Context, pluginID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	meta, ok := pm.plugins[pluginID]
	if !ok {
		return fmt.Errorf("插件不存在: %s", pluginID)
	}

	if meta.Enabled {
		return fmt.Errorf("插件已启用: %s", pluginID)
	}

	// 使用熔断器执行启用
	err := pm.circuitBreaker.Call(func() error {
		// 模拟启用插件：加载插件对象
		pluginDir := filepath.Join(pm.config.PluginDir, pluginID)
		// 模拟加载插件代码
		// 在实际实现中：import pluginDir 或 dlopen
		meta.Enabled = true
		return nil
	})
	if err != nil {
		return err
	}

	// 发布已启用事件
	pm.emitEvent(ctx, "plugin_enabled", map[string]interface{}{
		"pluginID": pluginID,
		"meta":     meta,
	})

	fmt.Printf("[Plugin] 插件已启用: %s\n", meta.Name)
	return nil
}

// DisablePlugin 禁用插件
func (pm *PluginManager) DisablePlugin(ctx context.Context, pluginID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	meta, ok := pm.plugins[pluginID]
	if !ok {
		return fmt.Errorf("插件不存在: %s", pluginID)
	}

	if !meta.Enabled {
		return fmt.Errorf("插件已禁用: %s", pluginID)
	}

	meta.Enabled = false
	pm.emitEvent(ctx, "plugin_disabled", map[string]interface{}{
		"pluginID": pluginID,
		"meta":     meta,
	})

	fmt.Printf("[Plugin] 插件已禁用: %s\n", meta.Name)
	return nil
}

// UninstallPlugin 卸载插件
func (pm *PluginManager) UninstallPlugin(ctx context.Context, pluginID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	meta, ok := pm.plugins[pluginID]
	if !ok {
		return fmt.Errorf("插件不存在: %s", pluginID)
	}

	if meta.Enabled {
		// 先禁用
		meta.Enabled = false
		pm.emitEvent(ctx, "plugin_disabled", map[string]interface{}{
			"pluginID": pluginID,
			"meta":     meta,
		})
	}

	// 移除插件目录
	pluginDir := filepath.Join(pm.config.PluginDir, pluginID)
	if err := os.RemoveAll(pluginDir); err != nil {
		return fmt.Errorf("卸载插件目录失败: %w", err)
	}

	delete(pm.plugins, pluginID)
	delete(pm.pluginObjs, pluginID)

	// 发布卸载事件
	pm.emitEvent(ctx, "plugin_uninstalled", map[string]interface{}{
		"pluginID": pluginID,
	})

	fmt.Printf("[Plugin] 插件已卸载: %s\n", meta.Name)
	return nil
}

// ListPlugins 列出所有插件
func (pm *PluginManager) ListPlugins() []*PluginMeta {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make([]*PluginMeta, 0, len(pm.plugins))
	for _, m := range pm.plugins {
		result = append(result, m)
	}
	return result
}

// HasPlugin 检查插件是否存在
func (pm *PluginManager) HasPlugin(pluginID string) bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	_, ok := pm.plugins[pluginID]
	return ok
}

// GetPlugin 获取插件元数据
func (pm *PluginManager) GetPlugin(pluginID string) (*PluginMeta, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	meta, ok := pm.plugins[pluginID]
	return meta, ok
}

// ReloadPlugin 重载插件（热重载）
func (pm *PluginManager) ReloadPlugin(ctx context.Context, pluginID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	meta, ok := pm.plugins[pluginID]
	if !ok {
		return fmt.Errorf("插件不存在: %s", pluginID)
	}

	if !meta.Enabled {
		return fmt.Errorf("插件未启用: %s", pluginID)
	}

	// 发布重载事件
	pm.emitEvent(ctx, "plugin_reloaded", map[string]interface{}{
		"pluginID": pluginID,
		"meta":     meta,
	})

	fmt.Printf("[Plugin] 插件已重载: %s\n", meta.Name)
	return nil
}

// ============ 插件事件类型

const (
	EventPluginInstalled   = "plugin_installed"
	EventPluginUninstalled = "plugin_uninstalled"
	EventPluginEnabled   = "plugin_enabled"
	EventPluginDisabled  = "plugin_disabled"
	EventPluginUpdated   = "plugin_updated"
	EventPluginReloaded  = "plugin_reloaded"
	EventPluginError     = "plugin_error"
)

// ============ 插件 SDK 推荐结构

// PluginSDK 推荐给插件开发者的最小化 SDK
type PluginSDK struct {
	Meta         *PluginMeta
	PluginManager *PluginManager
	PluginDir    string
}

// InitSDK 初始化 SDK (插件开调用)
func (sdk *PluginSDK) InitSDK() error {
	// 注册核心事件
	sdk.PluginManager.RegisterHandler(EventPluginInstalled, func(ctx context.Context, payload interface{}) error {
		_ = ctx
		_ = payload
		return nil
	})
	sdk.PluginManager.RegisterHandler(EventPluginError, func(ctx context.Context, payload interface{}) error {
		_ = ctx
		_ = payload
		return nil
	)
	return nil
}

// NotifyInstalled 通知框架插件已安装
func (sdk *PluginSDK) NotifyInstalled() {
	sdk.PluginManager.emitEvent(context.Background(), EventPluginInstalled, map[string]interface{}{
		"pluginID": sdk.Meta.ID,
	})
}

// NotifyError 通知框架插件出错
func (sdk *PluginSDK) NotifyError(err error) {
	sdk.PluginManager.emitEvent(context.Background(), EventPluginError, map[string]interface{}{
		"error": err.Error(),
	})
}

// NotifyEnabled 通知框架插件已启用
func (sdk *PluginSDK) NotifyEnabled() {
	sdk.PluginManager.emitEvent(context.Background(), EventPluginEnabled, map[string]interface{}{
		"pluginID": sdk.Meta.ID,
	})
}

// NotifyDisabled 通知框架插件已禁用
func (sdk *PluginSDK) NotifyDisabled() {
	sdk.PluginManager.emitEvent(context.Background(), EventPluginDisabled, map[string]interface{}{
		"pluginID": sdk.Meta.ID,
	})
}

// NotifyUpdated 通知框架插件已更新
func (sdk *PluginSDK) NotifyUpdated() {
	sdk.PluginManager.emitEvent(context.Background(), EventPluginUpdated, map[string]interface{}{
		"pluginID": sdk.Meta.ID,
	})
}