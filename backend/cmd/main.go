package main

import (
	"context"
	"log"
	"os"
	"os/signal"
    "net/http"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"nova-canvas-backend/internal/database"
	"nova-canvas-backend/internal/handlers"
	"nova-canvas-backend/internal/logger"
	"nova-canvas-backend/internal/middleware"
	"nova-canvas-backend/internal/repository"
	"nova-canvas-backend/internal/taskqueue"
)

func main() {
	_ = godotenv.Load()
	logger.Init()

	dbCfg := database.LoadConfig()
	db := database.MustConnect(dbCfg)
	defer func() {
		sqlDB, _ := db.DB()
		sqlDB.Close()
	}()

	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("[FATAL] Migration failed: %v", err)
	}
	if err := database.SeedTemplates(db); err != nil {
		log.Printf("[WARN] Template seeding failed: %v", err)
	}

	repos := &repository.Repos{
		Users:       repository.NewUserRepository(db),
		Projects:    repository.NewProjectRepository(db),
		Generations: repository.NewGenerationRepository(db),
		Templates:   repository.NewTemplateRepository(db),
	}

	queue, err := taskqueue.NewRedisQueue()
	if err != nil {
		log.Printf("[WARN] Redis unavailable, async tasks disabled: %v", err)
	}
	if queue != nil {
		go queue.StartProcessor(context.Background(), repos)
		defer queue.Close()
	}

	h := handlers.NewHandler(repos.Users, repos.Projects, repos.Generations, repos.Templates)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(logger.Middleware())
	r.Use(middleware.CORS())

	v1 := r.Group("/api/v1")
	{
		v1.POST("/auth/register", h.Register)
		v1.POST("/auth/login", h.Login)
		v1.GET("/health", h.HealthCheck)

		auth := v1.Group("")
		auth.Use(middleware.Auth())
		{
			auth.GET("/user/profile", h.GetProfile)
			auth.PUT("/user/profile", h.UpdateProfile)
			auth.GET("/projects", h.ListProjects)
			auth.POST("/projects", h.CreateProject)
			auth.GET("/projects/:id", h.GetProject)
			auth.PUT("/projects/:id", h.UpdateProject)
			auth.DELETE("/projects/:id", h.DeleteProject)
			auth.POST("/generate/image", h.GenerateImage)
			auth.POST("/generate/video", h.GenerateVideo)
			auth.POST("/generate/style-transfer", h.StyleTransfer)
			auth.GET("/generate/status/:task_id", h.GetGenerationStatus)
			auth.GET("/templates", h.ListTemplates)
			auth.GET("/templates/:id", h.GetTemplate)
			auth.POST("/compliance/check", h.CheckCompliance)
			auth.POST("/agent/chat", h.ChatCompletion)
			auth.GET("/ai/providers", h.ListProviders)
			auth.POST("/ai/chat", h.ChatWithProvider)
			auth.POST("/ai/batch-image", h.BatchGenerateImages)
			auth.GET("/scripts", h.ListScripts)
			auth.POST("/scripts", h.SaveScript)
			auth.GET("/scripts/:id", h.GetScript)
			auth.POST("/scripts/:id/run", h.RunScript)
			auth.POST("/scripts/run", h.RunScriptInline)
			auth.POST("/ai/video", h.GenerateVideoComposition)
			auth.POST("/ai/fission", h.GenerateFission)
			auth.POST("/ai/ad-script", h.GenerateAdScript)
			auth.POST("/ai/drama", h.GenerateDrama)
			auth.POST("/workflows/run", h.RunWorkflow)
			auth.POST("/recipes", h.SaveRecipe)
			auth.GET("/recipes", h.ListRecipes)
			auth.GET("/recipes/:id", h.GetRecipe)
			auth.POST("/recipes/:id/apply", h.ApplyRecipe)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[SERVER] Starting on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err.Error() != "http: Server closed" {
			log.Fatalf("[FATAL] Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[SERVER] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] Server forced shutdown: %v", err)
	}
	log.Println("[SERVER] Stopped")
}


