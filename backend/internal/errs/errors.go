package errs

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type AppError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

func (e *AppError) Error() string {
	return e.Message
}

func New(code int, message, detail string) *AppError {
	return &AppError{Code: code, Message: message, Detail: detail}
}

// Predefined errors
var (
	ErrBadRequest       = func(detail string) *AppError { return New(400, "Bad Request", detail) }
	ErrUnauthorized     = func(detail string) *AppError { return New(401, "Unauthorized", detail) }
	ErrForbidden        = func(detail string) *AppError { return New(403, "Forbidden", detail) }
	ErrNotFound         = func(detail string) *AppError { return New(404, "Not Found", detail) }
	ErrConflict         = func(detail string) *AppError { return New(409, "Conflict", detail) }
	ErrInsufficientCredits = func(detail string) *AppError { return New(402, "Insufficient Credits", detail) }
	ErrRateLimited      = func(detail string) *AppError { return New(429, "Rate Limited", detail) }
	ErrInternal         = func(detail string) *AppError { return New(500, "Internal Server Error", detail) }
	ErrModelUnavailable = func(detail string) *AppError { return New(503, "Model Unavailable", detail) }
)

func RespondError(c *gin.Context, err *AppError) {
	c.JSON(statusForCode(err.Code), gin.H{
		"error": gin.H{
			"code":    err.Code,
			"message": err.Message,
			"detail":  err.Detail,
		},
	})
}

// Respond 接受 service 层返回的通用 error：*AppError 原样输出，其余统一 500。
// 这样 handler 无需感知 service 内部的错误构造方式，也不会把底层错误原文透给客户端。
func Respond(c *gin.Context, err error) {
	if appErr, ok := err.(*AppError); ok {
		RespondError(c, appErr)
		return
	}
	RespondError(c, ErrInternal("Internal server error"))
}

func statusForCode(code int) int {
	if code >= 100 && code < 600 {
		return code
	}
	return http.StatusInternalServerError
}
