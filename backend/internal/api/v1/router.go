package v1

import (
	"github.com/gin-gonic/gin"

	"nova-canvas-backend/internal/api/v1/middleware"
	"nova-canvas-backend/internal/service"
)

// RegisterRoutes 注册所有 v1 路由
func RegisterRoutes(
	router *gin.Engine,
	genSvc service.GenerationService,
	authMiddleware gin.HandlerFunc,
) {
	// 健康检查（无需认证）
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})

	// API v1 分组
	v1Group := router.Group("/api/v1")
	v1Group.Use(authMiddleware) // 统一 JWT 认证
	{
		// 生成任务相关
		genHandler := NewGenerationHandler(nil, genSvc)
		genHandler.RegisterRoutes(v1Group)

		// 画布节点相关（后续补充）
		// nodeHandler := NewNodeHandler(nodeSvc)
		// nodeHandler.RegisterRoutes(v1Group)

		// 用户相关（后续补充）
		// userHandler := NewUserHandler(userSvc)
		// userHandler.RegisterRoutes(v1Group)
	}
}

// SetupMiddleware 设置全局中间件
func SetupMiddleware(router *gin.Engine) {
	router.Use(gin.Recovery())
	router.Use(middleware.RequestID())
	router.Use(middleware.Logger())
	router.Use(middleware.CORS())
}