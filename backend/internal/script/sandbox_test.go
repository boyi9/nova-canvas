package script

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGojaSandbox_ExecuteJS_Success(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	source := `
		var x = 10;
		var y = 20;
		progress(50, "halfway");
		({ result: x + y });
	`

	result, err := sandbox.ExecuteJS(ctx, source, DefaultResourceLimits(), nil)

	require.NoError(t, err)
	assert.Equal(t, "success", result.Status)
	assert.NotEmpty(t, result.TaskID)
	assert.Equal(t, int64(30), result.Result["result"])
	assert.GreaterOrEqual(t, result.DurationMs, int64(0))
}

func TestGojaSandbox_ExecuteJS_WithProgressCallback(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	var updates []ProgressUpdate
	source := `
		progress(25, "start");
		progress(75, "middle");
		"done";
	`

	result, err := sandbox.ExecuteJS(ctx, source, DefaultResourceLimits(), func(u ProgressUpdate) {
		updates = append(updates, u)
	})

	require.NoError(t, err)
	assert.Equal(t, "success", result.Status)
	assert.GreaterOrEqual(t, len(updates), 2)
	assert.Equal(t, 25, updates[0].Progress)
	assert.Equal(t, "start", updates[0].Message)
	assert.Equal(t, 75, updates[1].Progress)
	assert.Equal(t, "middle", updates[1].Message)
}

func TestGojaSandbox_ExecuteJS_Timeout(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	source := `
		while (true) {
			// nova loop
		}
	`

	limits := DefaultResourceLimits()
	limits.MaxExecutionTime = 100 * time.Millisecond

	result, err := sandbox.ExecuteJS(ctx, source, limits, nil)

	assert.Error(t, err)
	assert.Equal(t, ErrTimeout, err)
	assert.Equal(t, "timeout", result.Status)
	assert.Contains(t, result.Error, "timeout")
}

func TestGojaSandbox_ExecuteJS_ScriptError(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	source := `throw new Error("intentional error");`

	result, err := sandbox.ExecuteJS(ctx, source, DefaultResourceLimits(), nil)

	assert.Error(t, err)
	assert.Equal(t, "failed", result.Status)
	assert.Contains(t, result.Error, "intentional error")
}

func TestGojaSandbox_ExecuteJS_ConsoleLog(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	var logs []string
	source := `
		console.log("hello");
		console.log("world", 123);
	`

	result, err := sandbox.ExecuteJS(ctx, source, DefaultResourceLimits(), func(u ProgressUpdate) {
		if u.Message != "" {
			logs = append(logs, u.Message)
		}
	})

	require.NoError(t, err)
	assert.Equal(t, "success", result.Status)
	assert.Contains(t, logs, "[LOG] hello")
	assert.Contains(t, logs, "[LOG] world 123")
}

func TestGojaSandbox_ExecuteJS_ReturnsObject(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	source := `
		({ name: "test", value: 42, nested: { a: 1 } })
	`

	result, err := sandbox.ExecuteJS(ctx, source, DefaultResourceLimits(), nil)

	require.NoError(t, err)
	assert.Equal(t, "success", result.Status)
	assert.Equal(t, "test", result.Result["name"])
	assert.Equal(t, int64(42), result.Result["value"])
	assert.Equal(t, int64(1), result.Result["nested"].(map[string]interface{})["a"])
}

func TestGojaSandbox_Execute_UnsupportedLanguage(t *testing.T) {
	sandbox := NewGojaSandbox()
	ctx := context.Background()

	config := ScriptConfig{
		Language: "rust",
		Source:   "fn main() {}",
		Limits:   DefaultResourceLimits(),
	}

	result, err := sandbox.Execute(ctx, config, nil)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "unsupported language")
}

func TestDefaultResourceLimits(t *testing.T) {
	limits := DefaultResourceLimits()
	assert.Equal(t, 128, limits.MaxMemoryMB)
	assert.Equal(t, 50, limits.MaxCPUPercent)
	assert.Equal(t, 30*time.Second, limits.MaxExecutionTime)
	assert.Equal(t, int64(1024*1024), limits.MaxOutputSize)
}

func TestEstimateScriptCost(t *testing.T) {
	tests := []struct {
		name     string
		script   ScriptConfig
		expected int
	}{
		{
			name: "javascript base",
			script: ScriptConfig{
				Language: "javascript",
				Limits:   DefaultResourceLimits(),
			},
			expected: 2,
		},
		{
			name: "python base",
			script: ScriptConfig{
				Language: "python",
				Limits:   DefaultResourceLimits(),
			},
			expected: 3,
		},
		{
			name: "bash base",
			script: ScriptConfig{
				Language: "bash",
				Limits:   DefaultResourceLimits(),
			},
			expected: 1,
		},
		{
			name: "long timeout multiplier",
			script: ScriptConfig{
				Language: "javascript",
				Limits: ResourceLimits{
					MaxExecutionTime: 120 * time.Second,
				},
			},
			expected: 4,
		},
		{
			name: "high memory multiplier",
			script: ScriptConfig{
				Language: "javascript",
				Limits: ResourceLimits{
					MaxMemoryMB: 512,
				},
			},
			expected: 4,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cost := estimateScriptCost(tt.script)
			assert.Equal(t, tt.expected, cost)
		})
	}
}

func TestCalculateReward(t *testing.T) {
	tests := []struct {
		name     string
		result   *ExecutionResult
		expected int
	}{
		{
			name: "failed no reward",
			result: &ExecutionResult{Status: "failed"},
			expected: 0,
		},
		{
			name: "success fast low mem",
			result: &ExecutionResult{
				Status:      "success",
				DurationMs:  1000,
				MemoryPeak:  10 * 1024 * 1024,
			},
			expected: 3,
		},
		{
			name: "success slow",
			result: &ExecutionResult{
				Status:      "success",
				DurationMs:  10000,
				MemoryPeak:  100 * 1024 * 1024,
			},
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reward := calculateReward(ScriptConfig{}, tt.result)
			assert.Equal(t, tt.expected, reward)
		})
	}
}