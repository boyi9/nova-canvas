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
)

const (
	TypeImageGeneration   = "generation:image"
	TypeVideoGeneration   = "generation:video"
	TypeStyleTransfer     = "generation:style_transfer"
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

func (q *RedisQueue) StartProcessor(ctx context.Context, repos *repository.Repos) {
	mux := asynq.NewServeMux()

	mux.HandleFunc(TypeImageGeneration, makeImageHandler(repos))
	mux.HandleFunc(TypeVideoGeneration, makeVideoHandler(repos))
	mux.HandleFunc(TypeStyleTransfer, makeStyleTransferHandler(repos))

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

func safeParseUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		log.Printf("[TASK] Invalid UUID %q: %v", s, err)
	}
	return id
}
