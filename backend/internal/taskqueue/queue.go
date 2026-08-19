package taskqueue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"nova-canvas-backend/internal/aimodel"
	"nova-canvas-backend/internal/repository"
	"nova-canvas-backend/internal/script"
)

const (
	TypeImageGeneration   = "generation:image"
	TypeVideoGeneration   = "generation:video"
	TypeStyleTransfer     = "generation:style_transfer"
	TypeScriptExecution   = "script:execute"
)

type ImageTaskPayload struct {
	GenerationID string `json:"generation_id"`
	TaskID       string `json:"task_id"`
	Prompt       string `json:"prompt"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Style        string `json:"style"`
}

type VideoTaskPayload struct {
	GenerationID string `json:"generation_id"`
	TaskID       string `json:"task_id"`
	Prompt       string `json:"prompt"`
	Duration     int    `json:"duration"`
	Style        string `json:"style"`
}

type StyleTransferPayload struct {
	GenerationID string  `json:"generation_id"`
	TaskID       string  `json:"task_id"`
	ImageURL     string  `json:"image_url"`
	Style        string  `json:"style"`
	Strength     float64 `json:"strength"`
}

type ScriptTaskPayload struct {
	TaskID      string            `json:"task_id"`
	UserID      uint64            `json:"user_id"`
	Script      script.ScriptConfig `json:"script"`
	CallbackURL string            `json:"callback_url,omitempty"`
}

type RedisQueue struct {
	client    *asynq.Client
	server    *asynq.Server
}

func NewRedisQueue() (*RedisQueue, error) {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	password := os.Getenv("REDIS_PASSWORD")
	db := 0
	if v := os.Getenv("REDIS_DB"); v != "" {
		fmt.Sscanf(v, "%d", &db)
	}

	opts := asynq.RedisClientOpt{
		Addr:     addr,
		Password: password,
		DB:       db,
	}

	client := asynq.NewClient(opts)

	server := asynq.NewServer(opts, asynq.Config{
		Concurrency: 5,
		Queues: map[string]int{
			"critical": 3,
			"default":  5,
			"low":      2,
		},
	})

	log.Println("[QUEUE] Redis connected successfully")
	return &RedisQueue{client: client, server: server}, nil
}

func (q *RedisQueue) EnqueueImageTask(payload ImageTaskPayload) error {
	data, _ := json.Marshal(payload)
	task := asynq.NewTask(TypeImageGeneration, data)
	info, err := q.client.Enqueue(task,
		asynq.Queue("critical"),
		asynq.MaxRetry(3),
		asynq.Timeout(5*time.Minute),
		asynq.Retention(24*time.Hour),
	)
	if err != nil {
		return err
	}
	log.Printf("[QUEUE] Enqueued image task %s (id=%s)", payload.TaskID, info.ID)
	return nil
}

func (q *RedisQueue) EnqueueVideoTask(payload VideoTaskPayload) error {
	data, _ := json.Marshal(payload)
	task := asynq.NewTask(TypeVideoGeneration, data)
	info, err := q.client.Enqueue(task,
		asynq.Queue("default"),
		asynq.MaxRetry(2),
		asynq.Timeout(10*time.Minute),
		asynq.Retention(24*time.Hour),
	)
	if err != nil {
		return err
	}
	log.Printf("[QUEUE] Enqueued video task %s (id=%s)", payload.TaskID, info.ID)
	return nil
}

func (q *RedisQueue) EnqueueStyleTransfer(payload StyleTransferPayload) error {
	data, _ := json.Marshal(payload)
	task := asynq.NewTask(TypeStyleTransfer, data)
	info, err := q.client.Enqueue(task,
		asynq.Queue("default"),
		asynq.MaxRetry(2),
		asynq.Timeout(5*time.Minute),
		asynq.Retention(24*time.Hour),
	)
	if err != nil {
		return err
	}
	log.Printf("[QUEUE] Enqueued style transfer task %s (id=%s)", payload.TaskID, info.ID)
	return nil
}

func (q *RedisQueue) EnqueueScriptTask(payload ScriptTaskPayload) error {
	data, _ := json.Marshal(payload)
	task := asynq.NewTask(TypeScriptExecution, data)
	info, err := q.client.Enqueue(task,
		asynq.Queue("default"),
		asynq.MaxRetry(1),
		asynq.Timeout(10*time.Minute),
		asynq.Retention(24*time.Hour),
	)
	if err != nil {
		return err
	}
	log.Printf("[QUEUE] Enqueued script task %s (id=%s)", payload.TaskID, info.ID)
	return nil
}

func (q *RedisQueue) StartProcessor(ctx context.Context, repos *repository.Repos) {
	mux := asynq.NewServeMux()

	mux.HandleFunc(TypeImageGeneration, makeImageHandler(repos))
	mux.HandleFunc(TypeVideoGeneration, makeVideoHandler(repos))
	mux.HandleFunc(TypeStyleTransfer, makeStyleTransferHandler(repos))
	mux.HandleFunc(TypeScriptExecution, makeScriptHandler(repos))

	go func() {
		if err := q.server.Run(mux); err != nil {
			log.Printf("[QUEUE] Processor stopped: %v", err)
		}
	}()
	log.Println("[QUEUE] Task processor started")
}

func (q *RedisQueue) Close() {
	q.client.Close()
	q.server.Shutdown()
}

func makeImageHandler(repos *repository.Repos) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var payload ImageTaskPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return fmt.Errorf("unmarshal failed: %w", err)
		}

		log.Printf("[TASK] Processing image generation: %s", payload.TaskID)

		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"processing", "", "", "")

		result, err := aimodel.GenerateImage(ctx, aimodel.ImageRequest{
			Prompt: payload.Prompt,
			Width:  payload.Width,
			Height: payload.Height,
			Style:  payload.Style,
		})
		if err != nil {
			repos.Generations.UpdateStatus(ctx,
				safeParseUUID(payload.GenerationID),
				"failed", "", "", err.Error())
			return err
		}

		metaJSON, _ := json.Marshal(result.Meta)
		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"completed", result.URL, string(metaJSON), "")

		log.Printf("[TASK] Image generation completed: %s -> %s", payload.TaskID, result.URL)
		return nil
	}
}

func makeVideoHandler(repos *repository.Repos) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var payload VideoTaskPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return fmt.Errorf("unmarshal failed: %w", err)
		}

		log.Printf("[TASK] Processing video generation: %s", payload.TaskID)

		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"processing", "", "", "")

		result, err := aimodel.GenerateVideo(ctx, aimodel.VideoRequest{
			Prompt:   payload.Prompt,
			Duration: payload.Duration,
			Style:    payload.Style,
		})
		if err != nil {
			repos.Generations.UpdateStatus(ctx,
				safeParseUUID(payload.GenerationID),
				"failed", "", "", err.Error())
			return err
		}

		metaJSON, _ := json.Marshal(result.Meta)
		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"completed", result.URL, string(metaJSON), "")

		log.Printf("[TASK] Video generation completed: %s -> %s", payload.TaskID, result.URL)
		return nil
	}
}

func makeStyleTransferHandler(repos *repository.Repos) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var payload StyleTransferPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return fmt.Errorf("unmarshal failed: %w", err)
		}

		log.Printf("[TASK] Processing style transfer: %s", payload.TaskID)

		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"processing", "", "", "")

		result, err := aimodel.StyleTransfer(ctx, aimodel.StyleTransferRequest{
			ImageURL: payload.ImageURL,
			Style:    payload.Style,
			Strength: payload.Strength,
		})
		if err != nil {
			repos.Generations.UpdateStatus(ctx,
				safeParseUUID(payload.GenerationID),
				"failed", "", "", err.Error())
			return err
		}

		metaJSON, _ := json.Marshal(result.Meta)
		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(payload.GenerationID),
			"completed", result.URL, string(metaJSON), "")

		log.Printf("[TASK] Style transfer completed: %s -> %s", payload.TaskID, result.URL)
		return nil
	}
}

func makeScriptHandler(repos *repository.Repos) asynq.HandlerFunc {
	return func(ctx context.Context, t *asynq.Task) error {
		var payload ScriptTaskPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return fmt.Errorf("unmarshal failed: %w", err)
		}

		log.Printf("[TASK] Processing script execution: %s", payload.TaskID)

		refID := payload.Script.WorkingDir
		if refID == "" {
			refID = payload.TaskID
		}
		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(refID),
			"processing", "", "", "")

		sandbox := script.NewGojaSandbox()
		result, err := sandbox.Execute(ctx, script.ScriptConfig{
			Language:  payload.Script.Language,
			Source:    payload.Script.Source,
			Args:      payload.Script.Args,
			Env:       payload.Script.Env,
			Limits: script.ResourceLimits{
				MaxMemoryMB:     payload.Script.Limits.MaxMemoryMB,
				MaxCPUPercent:   payload.Script.Limits.MaxCPUPercent,
				MaxExecutionTime: payload.Script.Limits.MaxExecutionTime,
				MaxOutputSize:   payload.Script.Limits.MaxOutputSize,
			},
			WorkingDir: payload.Script.WorkingDir,
		}, nil)

		if err != nil {
			repos.Generations.UpdateStatus(ctx,
				safeParseUUID(refID),
				"failed", "", "", err.Error())
			return err
		}

		metaJSON, _ := json.Marshal(result.Result)
		repos.Generations.UpdateStatus(ctx,
			safeParseUUID(refID),
			"completed", "", string(metaJSON), "")

		log.Printf("[TASK] Script execution completed: %s", payload.TaskID)
		return nil
	}
}

func safeParseUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		log.Printf("[TASK] Invalid UUID %q: %v", s, err)
	}
	return id
}
