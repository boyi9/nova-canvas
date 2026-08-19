package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email     string         `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	Password  string         `gorm:"type:varchar(255);not null" json:"-"`
	Name      string         `gorm:"type:varchar(100);not null" json:"name"`
	Avatar    string         `gorm:"type:varchar(500)" json:"avatar"`
	Plan      string         `gorm:"type:varchar(20);default:'free';not null" json:"plan"`
	Credits   int            `gorm:"default:100;not null" json:"credits"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (User) TableName() string { return "users" }

type Project struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	Name        string         `gorm:"type:varchar(255);not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Scene       string         `gorm:"type:varchar(50);not null" json:"scene"`
	CanvasData  string         `gorm:"type:text;default:'{}'" json:"canvas_data"`
	Thumbnail   string         `gorm:"type:varchar(500)" json:"thumbnail"`
	Status      string         `gorm:"type:varchar(20);default:'draft';not null" json:"status"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	User        User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (Project) TableName() string { return "projects" }

type Generation struct {
	ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	ProjectID    *uuid.UUID     `gorm:"type:uuid;index" json:"project_id,omitempty"`
	Type         string         `gorm:"type:varchar(20);not null" json:"type"`
	Prompt       string         `gorm:"type:text;not null" json:"prompt"`
	Params       string         `gorm:"type:text" json:"params"`
	ResultURL    string         `gorm:"type:varchar(1000)" json:"result_url"`
	ResultMeta   string         `gorm:"type:text" json:"result_meta"`
	Status       string         `gorm:"type:varchar(20);default:'pending';not null;index" json:"status"`
	Error        string         `gorm:"type:text" json:"error"`
	CreditsCost  int            `gorm:"default:1;not null" json:"credits_cost"`
	TaskID       string         `gorm:"type:varchar(100);index" json:"task_id"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
	User         User           `gorm:"foreignKey:UserID" json:"-"`
	Project      Project        `gorm:"foreignKey:ProjectID" json:"-"`
}

func (Generation) TableName() string { return "generations" }

type Template struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Category    string    `gorm:"type:varchar(50);not null;index" json:"category"`
	Scene       string    `gorm:"type:varchar(50);not null" json:"scene"`
	Description string    `gorm:"type:text" json:"description"`
	Prompt      string    `gorm:"type:text;not null" json:"prompt"`
	Params      string    `gorm:"type:text" json:"params"`
	Thumbnail   string    `gorm:"type:varchar(500)" json:"thumbnail"`
	IsPremium   bool      `gorm:"default:false;not null" json:"is_premium"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (Template) TableName() string { return "templates" }
