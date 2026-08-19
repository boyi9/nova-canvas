package aimodel

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type ImageRequest struct {
	Prompt string `json:"prompt"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Style  string `json:"style"`
}

type VideoRequest struct {
	Prompt   string `json:"prompt"`
	Duration int    `json:"duration"`
	Style    string `json:"style"`
}

type StyleTransferRequest struct {
	ImageURL string  `json:"image_url"`
	Style    string  `json:"style"`
	Strength float64 `json:"strength"`
}

type GenerationResult struct {
	URL  string                 `json:"url"`
	Meta map[string]interface{} `json:"meta"`
}

type DeepSeekRequest struct {
	Model    string              `json:"model"`
	Messages []DeepSeekMessage   `json:"messages"`
}

type DeepSeekMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type DeepSeekResponse struct {
	Choices []struct {
		Message DeepSeekMessage `json:"message"`
	} `json:"choices"`
}

func GenerateImage(ctx context.Context, req ImageRequest) (*GenerationResult, error) {
	apiKey := os.Getenv("SEEDREAM_API_KEY")

	if apiKey == "" {
		return generateImageFallback(ctx, req)
	}

	payload := map[string]interface{}{
		"model":   "seedream-5.0",
		"prompt":  req.Prompt,
		"width":   req.Width,
		"height":  req.Height,
		"style":   req.Style,
		"n":       1,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.volcengine.com/v1/images/generations", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request failed: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal failed: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no image returned")
	}

	return &GenerationResult{
		URL: result.Data[0].URL,
		Meta: map[string]interface{}{
			"model":  "seedream-5.0",
			"width":  req.Width,
			"height": req.Height,
			"style":  req.Style,
		},
	}, nil
}

func generateImageFallback(ctx context.Context, req ImageRequest) (*GenerationResult, error) {
	fluxKey := os.Getenv("FLUX_API_KEY")
	if fluxKey == "" {
		return nil, fmt.Errorf("no image API key configured (SEEDREAM_API_KEY or FLUX_API_KEY)")
	}

	payload := map[string]interface{}{
		"prompt":       req.Prompt,
		"width":        req.Width,
		"height":       req.Height,
		"num_inference_steps": 30,
		"guidance_scale":      7.5,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.replicate.com/v1/predictions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Token "+fluxKey)

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("FLUX API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Output string `json:"output"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	if result.Status == "succeeded" && result.Output != "" {
		return &GenerationResult{
			URL: result.Output,
			Meta: map[string]interface{}{
				"model":  "flux",
				"task_id": result.ID,
			},
		}, nil
	}

	return &GenerationResult{
		URL:  "",
		Meta: map[string]interface{}{"task_id": result.ID, "status": result.Status},
	}, fmt.Errorf("FLUX generation pending, task_id: %s", result.ID)
}

func GenerateVideo(ctx context.Context, req VideoRequest) (*GenerationResult, error) {
	apiKey := os.Getenv("SEEDANCE_API_KEY")
	if apiKey == "" {
		return generateVideoFallback(ctx, req)
	}

	payload := map[string]interface{}{
		"model":    "seedance-2.0",
		"prompt":   req.Prompt,
		"duration": req.Duration,
		"style":    req.Style,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.volcengine.com/v1/videos/generations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Seedance API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Output string `json:"output"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return &GenerationResult{
		URL: result.Output,
		Meta: map[string]interface{}{
			"model":   "seedance-2.0",
			"task_id": result.ID,
			"duration": req.Duration,
		},
	}, nil
}

func generateVideoFallback(ctx context.Context, req VideoRequest) (*GenerationResult, error) {
	cogKey := os.Getenv("COGVIDEOX_API_KEY")
	if cogKey == "" {
		return nil, fmt.Errorf("no video API key configured")
	}

	payload := map[string]interface{}{
		"prompt":   req.Prompt,
		"duration": req.Duration,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.replicate.com/v1/predictions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Token "+cogKey)

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("CogVideoX API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID     string `json:"id"`
		Output string `json:"output"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return &GenerationResult{
		URL: result.Output,
		Meta: map[string]interface{}{
			"model":   "cogvideox",
			"task_id": result.ID,
		},
	}, nil
}

func StyleTransfer(ctx context.Context, req StyleTransferRequest) (*GenerationResult, error) {
	fluxKey := os.Getenv("FLUX_API_KEY")
	if fluxKey == "" {
		return nil, fmt.Errorf("no style transfer API key configured")
	}

	payload := map[string]interface{}{
		"image_url": req.ImageURL,
		"style":     req.Style,
		"strength":  req.Strength,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.replicate.com/v1/predictions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Token "+fluxKey)

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("Style transfer API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID     string `json:"id"`
		Output string `json:"output"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return &GenerationResult{
		URL: result.Output,
		Meta: map[string]interface{}{
			"style":    req.Style,
			"strength": req.Strength,
			"task_id":  result.ID,
		},
	}, nil
}

func ChatCompletion(ctx context.Context, messages []DeepSeekMessage) (string, error) {
	apiKey := os.Getenv("DEEPSEEK_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY not configured")
	}

	payload := DeepSeekRequest{
		Model:    "deepseek-chat",
		Messages: messages,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.deepseek.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("DeepSeek API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result DeepSeekResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from DeepSeek")
	}

	return result.Choices[0].Message.Content, nil
}
