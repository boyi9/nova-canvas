package v1

import (
	"github.com/gin-gonic/gin"

	"nova-canvas-backend/internal/api/v1/middleware"
	"nova-canvas-backend/internal/service"
)

// RegisterRoutes registers all v1 routes
func RegisterRoutes(
	router *gin.Engine,
	genSvc service.GenerationService,
	authMiddleware gin.HandlerFunc,
) {
	// Health check (no auth required)
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})

	// API v1 group
	v1Group := router.Group("/api/v1")
	v1Group.Use(authMiddleware)
	{
		// Generation routes
		genHandler := NewGenerationHandler(nil, genSvc)
		genHandler.RegisterRoutes(v1Group)

		// Canvas node routes (TODO)
		// nodeHandler := NewNodeHandler(nodeSvc)
		// nodeHandler.RegisterRoutes(v1Group)

		// User routes (handled in main.go)
		// userHandler := NewUserHandler(userSvc)
		// userHandler.RegisterRoutes(v1Group)
	}
}

// SetupMiddleware sets up global middleware
func SetupMiddleware(router *gin.Engine) {
	router.Use(gin.Recovery())
	router.Use(middleware.RequestID())
	router.Use(middleware.Logger())
	router.Use(middleware.CORS())
}