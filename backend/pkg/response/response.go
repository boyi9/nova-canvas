package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"nova-canvas-backend/pkg/errno"
)

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:    errno.ErrOK.Code,
		Message: errno.ErrOK.Message,
		Data:    data,
	})
}

func Error(c *gin.Context, err *errno.Errno, data ...interface{}) {
	resp := Response{
		Code:    err.Code,
		Message: err.Message,
	}
	if len(data) > 0 {
		resp.Data = data[0]
	}
	c.JSON(http.StatusOK, resp)
}

func ErrorWithCode(c *gin.Context, code int, message string, data ...interface{}) {
	resp := Response{
		Code:    code,
		Message: message,
	}
	if len(data) > 0 {
		resp.Data = data[0]
	}
	c.JSON(http.StatusOK, resp)
}