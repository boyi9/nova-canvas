package database

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Config struct {
	Host           string
	Port           int
	User           string
	Password       string
	DBName         string
	SSLMode        string
	MaxIdleConns   int
	MaxOpenConns   int
}

func LoadConfig() Config {
	port, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	maxIdle, _ := strconv.Atoi(getEnv("DB_MAX_IDLE_CONNS", "10"))
	maxOpen, _ := strconv.Atoi(getEnv("DB_MAX_OPEN_CONNS", "100"))

	return Config{
		Host:         getEnv("DB_HOST", "localhost"),
		Port:         port,
		User:         getEnv("DB_USER", "nova"),
		Password:     os.Getenv("DB_PASSWORD"),
		DBName:       getEnv("DB_NAME", "nova_canvas"),
		SSLMode:      getEnv("DB_SSLMODE", "disable"),
		MaxIdleConns: maxIdle,
		MaxOpenConns: maxOpen,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Connect(cfg Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%d sslmode=%s TimeZone=Asia/Shanghai",
		cfg.Host, cfg.User, cfg.Password, cfg.DBName, cfg.Port, cfg.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("[DB] PostgreSQL connected successfully")
	return db, nil
}

func MustConnect(cfg Config) *gorm.DB {
	db, err := Connect(cfg)
	if err != nil {
		log.Fatalf("[FATAL] Database connection failed: %v", err)
	}
	return db
}
