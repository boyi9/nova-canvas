package database

import (
	"log"

	"gorm.io/gorm"
	"nova-canvas-backend/internal/models"
)

func AutoMigrate(db *gorm.DB) error {
	log.Println("[DB] Running auto-migration...")

	err := db.AutoMigrate(
		&models.User{},
		&models.Project{},
		&models.Generation{},
		&models.Template{},
	)
	if err != nil {
		return err
	}

	log.Println("[DB] Migration completed successfully")
	return nil
}

func SeedTemplates(db *gorm.DB) error {
	var count int64
	db.Model(&models.Template{}).Count(&count)
	if count > 0 {
		log.Println("[DB] Templates already seeded, skipping")
		return nil
	}

	templates := []models.Template{
		{Name: "淘宝主图白底", Category: "ecommerce", Scene: "main-image", Prompt: "Professional e-commerce product photo, white background, studio lighting, 8K, {product_name}", IsPremium: false},
		{Name: "抖音主图场景", Category: "ecommerce", Scene: "main-image", Prompt: "Lifestyle product photography, modern minimalist, warm lighting, {product_name}", IsPremium: false},
		{Name: "TVC广告脚本", Category: "advertising", Scene: "tvc", Prompt: "Professional TV commercial script for {product_name}, emotional storytelling, 30 seconds", IsPremium: true},
		{Name: "品牌宣传片", Category: "advertising", Scene: "brand", Prompt: "Brand promotional video for {brand_name}, corporate style, 2 minutes", IsPremium: true},
		{Name: "短剧分镜模板", Category: "drama", Scene: "storyboard", Prompt: "Short drama storyboard, 9-grid layout, scene: {scene_description}, episode {episode_count}", IsPremium: false},
	}

	for i := range templates {
		if err := db.Create(&templates[i]).Error; err != nil {
			return err
		}
	}

	log.Printf("[DB] Seeded %d templates\n", len(templates))
	return nil
}
