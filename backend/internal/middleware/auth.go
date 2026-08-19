package middleware

import (
    "log"
    "net/http"
    "os"
    "strings"
    "sync"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
    "github.com/joho/godotenv"
)

var (
    jwtSecret     []byte
    jwtSecretOnce sync.Once
)

func jwtSecretFunc() []byte {
    jwtSecretOnce.Do(func() {
        _ = godotenv.Load()
        secret := os.Getenv("JWT_SECRET")
        if secret == "" {
            log.Fatal("[FATAL] JWT_SECRET environment variable is required")
        }
        jwtSecret = []byte(secret)
    })
    return jwtSecret
}

func GenerateToken(userID, email string) (string, error) {
    claims := jwt.MapClaims{
        "user_id": userID,
        "email":   email,
        "exp":     time.Now().Add(24 * time.Hour).Unix(),
        "iat":     time.Now().Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtSecretFunc())
}

func Auth() gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }
        parts := strings.SplitN(authHeader, " ", 2)
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
            c.Abort()
            return
        }
        tokenString := parts[1]
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            return jwtSecretFunc(), nil
        })
        if err != nil || !token.Valid {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }
        claims, ok := token.Claims.(jwt.MapClaims)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }
        userID, _ := claims["user_id"].(string)
        email, _ := claims["email"].(string)
        c.Set("user_id", userID)
        c.Set("email", email)
        c.Next()
    }
}

func CORS() gin.HandlerFunc {
    allowedOrigins := strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",")
    if len(allowedOrigins) == 0 || allowedOrigins[0] == "" {
        allowedOrigins = []string{"http://localhost:3000", "http://localhost:5173"}
    }
    originMap := make(map[string]bool, len(allowedOrigins))
    for _, o := range allowedOrigins {
        originMap[strings.TrimSpace(o)] = true
    }
    return func(c *gin.Context) {
        origin := c.GetHeader("Origin")
        if originMap[origin] {
            c.Header("Access-Control-Allow-Origin", origin)
        }
        c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
        c.Header("Access-Control-Allow-Credentials", "true")
        c.Header("Access-Control-Max-Age", "86400")
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }
        c.Next()
    }
}