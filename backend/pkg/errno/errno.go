package errno

import "errors"

type Errno struct {
	Code    int
	Message string
}

func (e *Errno) Error() string {
	return e.Message
}

func (e *Errno) WithMessage(msg string) *Errno {
	return &Errno{
		Code:    e.Code,
		Message: msg,
	}
}

var (
	// 通用错误
	ErrOK                  = &Errno{Code: 0, Message: "OK"}
	ErrInternalServerError = &Errno{Code: 500001, Message: "Internal server error"}
	ErrInvalidParam        = &Errno{Code: 400001, Message: "Invalid parameter"}
	ErrUnauthorized        = &Errno{Code: 401001, Message: "Unauthorized"}
	ErrNotFound            = &Errno{Code: 404001, Message: "Resource not found"}
	ErrForbidden           = &Errno{Code: 403001, Message: "Forbidden"}
	ErrTooManyRequests     = &Errno{Code: 429001, Message: "Too many requests"}

	// 业务错误
	ErrUserNotFound      = &Errno{Code: 404101, Message: "User not found"}
	ErrUserExists        = &Errno{Code: 409101, Message: "User already exists"}
	ErrInvalidCredential = &Errno{Code: 401101, Message: "Invalid credentials"}
	ErrProjectNotFound   = &Errno{Code: 404201, Message: "Project not found"}
	ErrGenerationNotFound = &Errno{Code: 404301, Message: "Generation task not found"}
	ErrGenerationFailed  = &Errno{Code: 500301, Message: "Generation failed"}
	ErrTemplateNotFound  = &Errno{Code: 404401, Message: "Template not found"}

	// 根据错误码查找
	errMap = map[int]*Errno{
		0:       ErrOK,
		500001:  ErrInternalServerError,
		400001:  ErrInvalidParam,
		401001:  ErrUnauthorized,
		404001:  ErrNotFound,
		403001:  ErrForbidden,
		429001:  ErrTooManyRequests,
		404101:  ErrUserNotFound,
		409101:  ErrUserExists,
		401101:  ErrInvalidCredential,
		404201:  ErrProjectNotFound,
		404301:  ErrGenerationNotFound,
		500301:  ErrGenerationFailed,
		404401:  ErrTemplateNotFound,
	}
)

func New(code int, msg string) *Errno {
	return &Errno{Code: code, Message: msg}
}

func IsErr(err error, target *Errno) bool {
	var e *Errno
	if errors.As(err, &e) {
		return e.Code == target.Code
	}
	return false
}

func Decode(err error) *Errno {
	var e *Errno
	if errors.As(err, &e) {
		return e
	}
	return ErrInternalServerError
}