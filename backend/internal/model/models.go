package model

// Model 定义数据库模型相关的结构体
type User struct {
	ID        uint64 `gorm:"primaryKey"`
	Username  string `gorm:"uniqueIndex;size:50"`
	Email     string `gorm:"uniqueIndex;size:100"`
	Password  string `gorm:"size:255"`
	CreatedAt int64
	UpdatedAt int64
}

type Project struct {
	ID        uint64 `gorm:"primaryKey"`
	UserID    uint64 `gorm:"index"`
	Name      string `gorm:"size:100"`
	Data      string `gorm:"type:text"`
	CreatedAt int64
	UpdatedAt int64
}

type Generation struct {
	ID        uint64 `gorm:"primaryKey"`
	ProjectID uint64 `gorm:"index"`
	UserID    uint64 `gorm:"index"`
	Status    string `gorm:"size:20"` // pending, processing, completed, failed
	Prompt    string `gorm:"type:text"`
	ResultURL string `gorm:"size:500"`
	ErrorMsg  string `gorm:"type:text"`
	Meta      string `gorm:"type:text"`
	CreatedAt int64
	UpdatedAt int64
}

type Template struct {
	ID          uint64 `gorm:"primaryKey"`
	Name        string `gorm:"size:100"`
	Description string `gorm:"type:text"`
	Config      string `gorm:"type:text"`
	CreatedAt   int64
	UpdatedAt   int64
}