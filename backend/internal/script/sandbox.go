package script

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/google/uuid"
)

// forbiddenScriptTokens are denied in user scripts because they escape the
// sandbox (node builtins, network, filesystem, dynamic code generation).
var forbiddenScriptTokens = []string{
	"require(", "import(", "process.", "child_process",
	"module.exports", "fetch(", "XMLHttpRequest",
	"__dirname", "__filename", "eval(",
}

var (
	ErrTimeout       = errors.New("script execution timeout")
	ErrMemoryLimit   = errors.New("memory limit exceeded")
	ErrPermissionDenied = errors.New("permission denied")
	ErrScriptError   = errors.New("script execution error")
)

type Permission string

const (
	PermNetwork  Permission = "network"
	PermReadFS   Permission = "readfs"
	PermWriteFS  Permission = "writefs"
	PermExec     Permission = "exec"
	PermEnv      Permission = "env"
)

type ResourceLimits struct {
	MaxMemoryMB     int           `json:"max_memory_mb"`
	MaxCPUPercent   int           `json:"max_cpu_percent"`
	MaxExecutionTime time.Duration `json:"max_execution_time"`
	MaxOutputSize   int64         `json:"max_output_size"`
}

func DefaultResourceLimits() ResourceLimits {
	return ResourceLimits{
		MaxMemoryMB:      128,
		MaxCPUPercent:    50,
		MaxExecutionTime: 30 * time.Second,
		MaxOutputSize:    1024 * 1024, // 1MB
	}
}

type ScriptConfig struct {
	Language      string         `json:"language"`       // javascript, python, bash
	Source        string         `json:"source"`         // script source code
	Args          []string       `json:"args"`           // command line arguments
	Env           map[string]string `json:"env"`         // environment variables
	Permissions   []Permission   `json:"permissions"`    // granted permissions
	Limits        ResourceLimits `json:"limits"`         // resource limits
	WorkingDir    string         `json:"working_dir"`    // working directory
}

type ExecutionResult struct {
	TaskID      string                 `json:"task_id"`
	Status      string                 `json:"status"`       // success, failed, timeout, killed
	ExitCode    int                    `json:"exit_code"`
	Output      string                 `json:"output"`
	Error       string                 `json:"error"`
	DurationMs  int64                  `json:"duration_ms"`
	MemoryPeak  int64                  `json:"memory_peak_bytes"`
	Result      map[string]interface{} `json:"result"`       // parsed JSON result if applicable
	StartedAt   time.Time              `json:"started_at"`
	FinishedAt  time.Time              `json:"finished_at"`
}

type ProgressCallback func(progress ProgressUpdate)

type ProgressUpdate struct {
	TaskID    string                 `json:"task_id"`
	Progress  int                    `json:"progress"`   // 0-100
	Message   string                 `json:"message"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"`
}

type Sandbox interface {
	Execute(ctx context.Context, config ScriptConfig, onProgress ProgressCallback) (*ExecutionResult, error)
	ExecuteJS(ctx context.Context, source string, limits ResourceLimits, onProgress ProgressCallback) (*ExecutionResult, error)
	ExecuteProcess(ctx context.Context, command string, args []string, limits ResourceLimits, onProgress ProgressCallback) (*ExecutionResult, error)
}

type GojaSandbox struct {
	mu sync.Mutex
}

func NewGojaSandbox() *GojaSandbox {
	return &GojaSandbox{}
}

func (s *GojaSandbox) Execute(ctx context.Context, config ScriptConfig, onProgress ProgressCallback) (*ExecutionResult, error) {
	if err := ValidateScriptConfig(config); err != nil {
		return nil, err
	}
	switch config.Language {
	case "javascript", "js":
		return s.ExecuteJS(ctx, config.Source, config.Limits, onProgress)
	case "python", "py":
		return s.ExecuteProcess(ctx, "python", []string{"-c", config.Source}, config.Limits, onProgress)
	case "bash", "sh":
		return s.ExecuteProcess(ctx, "bash", []string{"-c", config.Source}, config.Limits, onProgress)
	default:
		return nil, fmt.Errorf("unsupported language: %s", config.Language)
	}
}

func (s *GojaSandbox) ExecuteJS(ctx context.Context, source string, limits ResourceLimits, onProgress ProgressCallback) (*ExecutionResult, error) {
	if err := ValidateScriptSource(source); err != nil {
		return nil, err
	}

	taskID := uuid.New().String()
	startedAt := time.Now()

	result := &ExecutionResult{
		TaskID:    taskID,
		Status:    "running",
		StartedAt: startedAt,
	}

	vm := goja.New()

	if limits.MaxExecutionTime > 0 {
		ctx, cancel := context.WithTimeout(ctx, limits.MaxExecutionTime)
		defer cancel()

		done := make(chan struct{})
		var execErr error

		go func() {
			defer close(done)
			execErr = s.runJS(vm, source, limits, onProgress, taskID, result)
		}()

		select {
		case <-done:
			result.FinishedAt = time.Now()
			result.DurationMs = result.FinishedAt.Sub(result.StartedAt).Milliseconds()
			if execErr != nil {
				if errors.Is(execErr, ErrTimeout) {
					result.Status = "timeout"
				} else {
					result.Status = "failed"
				}
				result.Error = execErr.Error()
				return result, execErr
			}
			result.Status = "success"
		case <-ctx.Done():
			// Hard deadline: force an interrupt so a busy loop cannot peg a CPU
			// core forever, then wait for the runner goroutine to unwind.
			vm.Interrupt(ErrTimeout)
			<-done
			result.Status = "timeout"
			result.Error = ErrTimeout.Error()
			result.FinishedAt = time.Now()
			result.DurationMs = result.FinishedAt.Sub(result.StartedAt).Milliseconds()
			return result, ErrTimeout
		}
	} else {
		if err := s.runJS(vm, source, limits, onProgress, taskID, result); err != nil {
			result.Status = "failed"
			result.Error = err.Error()
			return result, err
		}
		result.Status = "success"
	}

	result.FinishedAt = time.Now()
	result.DurationMs = result.FinishedAt.Sub(result.StartedAt).Milliseconds()
	return result, nil
}

// ValidateScriptSource rejects scripts that attempt to escape the sandbox via
// node builtins, dynamic code generation, or network/filesystem access.
func ValidateScriptSource(source string) error {
	for _, tok := range forbiddenScriptTokens {
		if strings.Contains(source, tok) {
			return fmt.Errorf("%w: forbidden token %q in script", ErrPermissionDenied, tok)
		}
	}
	return nil
}

// ValidateScriptConfig enforces the permission policy. High-risk permissions
// (exec, network, write-fs) are never granted by this sandbox, and JS sources
// are scanned for forbidden tokens.
func ValidateScriptConfig(config ScriptConfig) error {
	for _, p := range config.Permissions {
		switch p {
		case PermExec, PermNetwork, PermWriteFS:
			return fmt.Errorf("%w: permission %q is not allowed", ErrPermissionDenied, p)
		}
	}
	if config.Language == "javascript" || config.Language == "js" {
		if err := ValidateScriptSource(config.Source); err != nil {
			return err
		}
	}
	return nil
}

func (s *GojaSandbox) runJS(vm *goja.Runtime, source string, limits ResourceLimits, onProgress ProgressCallback, taskID string, result *ExecutionResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Arm a cooperative interrupt so a runaway loop (e.g. `while(true){}`) is
	// terminated at the next interrupt point instead of spinning a core forever.
	if limits.MaxExecutionTime > 0 {
		time.AfterFunc(limits.MaxExecutionTime, func() {
			vm.Interrupt(ErrTimeout)
		})
	}

	console := vm.NewObject()
	_ = console.Set("log", func(call goja.FunctionCall) goja.Value {
		msg := ""
		for i, arg := range call.Arguments {
			if i > 0 {
				msg += " "
			}
			msg += arg.String()
		}
		if onProgress != nil {
			onProgress(ProgressUpdate{
				TaskID:    taskID,
				Progress:  -1,
				Message:   "[LOG] " + msg,
				Timestamp: time.Now(),
			})
		}
		return goja.Undefined()
	})
	vm.Set("console", console)

	progressFn := func(p int, msg string, meta map[string]interface{}) {
		if onProgress != nil {
			onProgress(ProgressUpdate{
				TaskID:    taskID,
				Progress:  p,
				Message:   msg,
				Timestamp: time.Now(),
				Metadata:  meta,
			})
		}
	}
	vm.Set("progress", progressFn)

	val, err := vm.RunString(source)
	vm.ClearInterrupt()
	if err != nil {
		if ie, ok := err.(*goja.InterruptedError); ok {
			_ = ie
			return ErrTimeout
		}
		return fmt.Errorf("%w: %v", ErrScriptError, err)
	}

	if onProgress != nil {
		onProgress(ProgressUpdate{
			TaskID:    taskID,
			Progress:  100,
			Message:   "Script completed",
			Timestamp: time.Now(),
		})
	}

	if val != nil {
		exportedVal := val.Export()
		if m, ok := exportedVal.(map[string]interface{}); ok {
			result.Result = m
		}
		output, _ := json.MarshalIndent(exportedVal, "", "  ")
		result.Output = string(output)
	}

	return nil
}

func (s *GojaSandbox) ExecuteProcess(ctx context.Context, command string, args []string, limits ResourceLimits, onProgress ProgressCallback) (*ExecutionResult, error) {
	taskID := uuid.New().String()
	startedAt := time.Now()

	result := &ExecutionResult{
		TaskID:    taskID,
		Status:    "running",
		StartedAt: startedAt,
	}

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")

	var stdout, stderr []byte
	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		result.Status = "failed"
		result.Error = err.Error()
		result.FinishedAt = time.Now()
		result.DurationMs = result.FinishedAt.Sub(startedAt).Milliseconds()
		return result, err
	}

	done := make(chan error, 1)
	go func() {
		stdout, _ = io.ReadAll(stdoutPipe)
		stderr, _ = io.ReadAll(stderrPipe)
		done <- cmd.Wait()
	}()

	var timeoutCh <-chan time.Time
	if limits.MaxExecutionTime > 0 {
		timeoutCh = time.After(limits.MaxExecutionTime)
	}

	select {
	case err := <-done:
		result.FinishedAt = time.Now()
		result.DurationMs = result.FinishedAt.Sub(startedAt).Milliseconds()
		result.Output = string(stdout)
		result.Error = string(stderr)
		if err != nil {
			result.Status = "failed"
			result.ExitCode = cmd.ProcessState.ExitCode()
			return result, fmt.Errorf("%w: %v", ErrScriptError, err)
		}
		result.Status = "success"
		result.ExitCode = 0
	case <-timeoutCh:
		result.Status = "timeout"
		result.Error = ErrTimeout.Error()
		_ = cmd.Process.Kill()
		<-done // wait for cleanup
		return result, ErrTimeout
	}

	if onProgress != nil {
		onProgress(ProgressUpdate{
			TaskID:   taskID,
			Progress: 100,
			Message:  "Process completed",
			Timestamp: time.Now(),
		})
	}

	return result, nil
}

type ScriptTaskManager struct {
	sandbox   Sandbox
	queue     TaskQueue
	wsHub     *WSProgressHub
	pointsSvc PointsService
}

type TaskQueue interface {
	EnqueueScriptTask(payload ScriptTaskPayload) error
}

type ScriptTaskPayload struct {
	TaskID      string            `json:"task_id"`
	UserID      uint64            `json:"user_id"`
	Script      ScriptConfig      `json:"script"`
	CallbackURL string            `json:"callback_url,omitempty"`
}

type PointsService interface {
	DeductPoints(userID uint64, amount int, reason string) error
	AddPoints(userID uint64, amount int, reason string) error
	GetBalance(userID uint64) (int, error)
}

func NewScriptTaskManager(sandbox Sandbox, queue TaskQueue, wsHub *WSProgressHub, pointsSvc PointsService) *ScriptTaskManager {
	return &ScriptTaskManager{
		sandbox:   sandbox,
		queue:     queue,
		wsHub:     wsHub,
		pointsSvc: pointsSvc,
	}
}

func (m *ScriptTaskManager) SubmitScriptTask(ctx context.Context, userID uint64, script ScriptConfig, callbackURL string) (string, error) {
	taskID := uuid.New().String()

	estimatedCost := estimateScriptCost(script)
	if estimatedCost > 0 {
		balance, err := m.pointsSvc.GetBalance(userID)
		if err != nil {
			return "", fmt.Errorf("failed to check points balance: %w", err)
		}
		if balance < estimatedCost {
			return "", fmt.Errorf("insufficient points: need %d, have %d", estimatedCost, balance)
		}
	}

	payload := ScriptTaskPayload{
		TaskID:      taskID,
		UserID:      userID,
		Script:      script,
		CallbackURL: callbackURL,
	}

	if err := m.queue.EnqueueScriptTask(payload); err != nil {
		return "", fmt.Errorf("failed to enqueue task: %w", err)
	}

	if estimatedCost > 0 {
		if err := m.pointsSvc.DeductPoints(userID, estimatedCost, "script_execution"); err != nil {
			return "", fmt.Errorf("failed to deduct points: %w", err)
		}
	}

	return taskID, nil
}

func (m *ScriptTaskManager) ProcessScriptTask(ctx context.Context, payload ScriptTaskPayload) error {
	progressCh := make(chan ProgressUpdate, 10)
	done := make(chan struct{})

	go func() {
		for update := range progressCh {
			m.wsHub.Broadcast(update)
			if payload.CallbackURL != "" {
				go sendCallback(payload.CallbackURL, update)
			}
		}
		close(done)
	}()

	onProgress := func(update ProgressUpdate) {
		select {
		case progressCh <- update:
		default:
		}
	}

	result, err := m.sandbox.Execute(ctx, payload.Script, onProgress)
	close(progressCh)
	<-done

	if err != nil && result != nil {
		result.Status = "failed"
		result.Error = err.Error()
	}

	if result != nil && result.Status == "success" {
		reward := calculateReward(payload.Script, result)
		if reward > 0 {
			_ = m.pointsSvc.AddPoints(payload.UserID, reward, "script_completion_reward")
		}
	}

	return nil
}

func estimateScriptCost(script ScriptConfig) int {
	baseCost := 1
	switch script.Language {
	case "javascript", "js":
		baseCost = 2
	case "python", "py":
		baseCost = 3
	case "bash", "sh":
		baseCost = 1
	}
	if script.Limits.MaxExecutionTime > 60*time.Second {
		baseCost *= 2
	}
	if script.Limits.MaxMemoryMB > 256 {
		baseCost *= 2
	}
	return baseCost
}

func calculateReward(script ScriptConfig, result *ExecutionResult) int {
	if result.Status != "success" {
		return 0
	}
	base := 1
	if result.DurationMs < 5000 {
		base += 1
	}
	if result.MemoryPeak < 50*1024*1024 {
		base += 1
	}
	return base
}

func sendCallback(url string, update ProgressUpdate) {
	_ = url
	_ = update
}