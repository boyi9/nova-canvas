package service

import (
	"context"

	"nova-canvas/backend/internal/api/v1"
	"nova-canvas/backend/internal/model"
	"nova-canvas/backend/pkg/errno"
)

// GenerationService 定义生成业务逻辑接口
type GenerationService interface {
	// CreateGeneration 创建生成任务
	CreateGeneration(ctx context.Context, userID uint64, req *v1.CreateGenerationRequest) (*v1.CreateGenerationResponse, error)

	// GetGeneration 获取任务详情
	GetGeneration(ctx context.Context, userID uint64, taskID string) (*v1.GetGenerationResponse, error)

	// ListGenerations 分页查询任务列表
	ListGenerations(ctx context.Context, userID uint64, req *v1.ListGenerationsRequest) (*v1.ListGenerationsResponse, error)

	// CancelGeneration 取消任务
	CancelGeneration(ctx context.Context, userID uint64, taskID string) error
}

// generationServiceImpl 实现
type generationServiceImpl struct {
	db           *gorm.DB
	taskRepo     model.GenerationTaskRepository
	nodeRepo     model.CanvasNodeRepository
	asynqClient  *asynq.Client
	storageSvc   StorageService
}

// NewGenerationService 构造函数
func NewGenerationService(
	db *gorm.DB,
	taskRepo model.GenerationTaskRepository,
	nodeRepo model.CanvasNodeRepository,
	asynqClient *asynq.Client,
	storageSvc StorageService,
) GenerationService {
	return &generationServiceImpl{
		db:          db,
		taskRepo:    taskRepo,
		nodeRepo:    nodeRepo,
		asynqClient: asynqClient,
		storageSvc:  storageSvc,
	}
}

func (s *generationServiceImpl) CreateGeneration(ctx context.Context, userID uint64, req *v1.CreateGenerationRequest) (*v1.CreateGenerationResponse, error) {
	// 1. 校验参考节点是否存在且属于用户
	if len(req.ReferenceNodeIDs) > 0 {
		nodes, err := s.nodeRepo.GetByIDs(ctx, req.ReferenceNodeIDs)
		if err != nil {
			return nil, errno.ErrInternal.WithMessage("failed to fetch reference nodes")
		}
		if len(nodes) != len(req.ReferenceNodeIDs) {
			return nil, errno.ErrNotFound.WithMessage("some reference nodes not found")
		}
		for _, node := range nodes {
			if node.UserID != userID {
				return nil, errno.ErrForbidden.WithMessage("reference node not owned by user")
			}
		}
	}

	// 2. 创建任务记录
	task := &model.GenerationTask{
		UserID:           userID,
		Prompt:           req.Prompt,
		NegativePrompt:   req.NegativePrompt,
		Model:            req.Model,
		Parameters:       req.Parameters,
		ReferenceNodeIDs: req.ReferenceNodeIDs,
		InsertPosition:   req.InsertPosition,
		NodeType:         req.NodeType,
		Status:           model.TaskStatusPending,
		Progress:         0,
	}
	if err := s.taskRepo.Create(ctx, task); err != nil {
		return nil, errno.ErrInternal.WithMessage("failed to create task")
	}

	// 3. 推送异步任务到 Asynq 队列
	payload := map[string]interface{}{
		"task_id":          task.ID,
		"user_id":          userID,
		"prompt":           req.Prompt,
		"negative_prompt":  req.NegativePrompt,
		"model":            req.Model,
		"parameters":       req.Parameters,
		"reference_nodes":  req.ReferenceNodeIDs,
		"insert_position":  req.InsertPosition,
		"node_type":        req.NodeType,
	}
	taskPayload, _ := json.Marshal(payload)
	asynqTask := asynq.NewTask("generate:process", taskPayload)
	if _, err := s.asynqClient.Enqueue(asynqTask, asynq.MaxRetry(3)); err != nil {
		// 任务入队失败，标记任务为失败
		s.taskRepo.UpdateStatus(ctx, task.ID, model.TaskStatusFailed, "queue failed")
		return nil, errno.ErrInternal.WithMessage("failed to enqueue task")
	}

	return &v1.CreateGenerationResponse{TaskID: task.ID.String()}, nil
}

func (s *generationServiceImpl) GetGeneration(ctx context.Context, userID uint64, taskID string) (*v1.GetGenerationResponse, error) {
	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errno.ErrNotFound.WithMessage("generation task not found")
		}
		return nil, errno.ErrInternal.WithMessage("failed to get task")
	}

	if task.UserID != userID {
		return nil, errno.ErrForbidden.WithMessage("task not owned by user")
	}

	return &v1.GetGenerationResponse{
		TaskID:     task.ID.String(),
		Status:     string(task.Status),
		Progress:   task.Progress,
		ResultURL:  task.ResultURL,
		ErrorMsg:   task.ErrorMsg,
		CreatedAt:  task.CreatedAt.Unix(),
		UpdatedAt:  task.UpdatedAt.Unix(),
	}, nil
}

func (s *generationServiceImpl) ListGenerations(ctx context.Context, userID uint64, req *v1.ListGenerationsRequest) (*v1.ListGenerationsResponse, error) {
	filter := model.GenerationTaskFilter{
		UserID:   userID,
		Status:   req.Status,
		NodeType: req.NodeType,
		Page:     req.Page,
		PageSize: req.PageSize,
	}

	tasks, total, err := s.taskRepo.List(ctx, filter)
	if err != nil {
		return nil, errno.ErrInternal.WithMessage("failed to list tasks")
	}

	list := make([]v1.GetGenerationResponse, 0, len(tasks))
	for _, task := range tasks {
		list = append(list, v1.GetGenerationResponse{
			TaskID:     task.ID.String(),
			Status:     string(task.Status),
			Progress:   task.Progress,
			ResultURL:  task.ResultURL,
			ErrorMsg:   task.ErrorMsg,
			CreatedAt:  task.CreatedAt.Unix(),
			UpdatedAt:  task.UpdatedAt.Unix(),
		})
	}

	return &v1.ListGenerationsResponse{
		Total: total,
		List:  list,
	}, nil
}

func (s *generationServiceImpl) CancelGeneration(ctx context.Context, userID uint64, taskID string) error {
	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errno.ErrNotFound.WithMessage("generation task not found")
		}
		return errno.ErrInternal.WithMessage("failed to get task")
	}

	if task.UserID != userID {
		return errno.ErrForbidden.WithMessage("task not owned by user")
	}

	// 仅允许取消 pending/running 状态
	if task.Status != model.TaskStatusPending && task.Status != model.TaskStatusRunning {
		return errno.ErrInvalidState.WithMessage("task cannot be cancelled")
	}

	// TODO: 如果是 running 状态，需要发送取消信号给 Worker
	// 这里简化处理：直接更新状态
	if err := s.taskRepo.UpdateStatus(ctx, task.ID, model.TaskStatusCancelled, "cancelled by user"); err != nil {
		return errno.ErrInternal.WithMessage("failed to cancel task")
	}

	return nil
}