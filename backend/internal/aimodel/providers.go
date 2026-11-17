package aimodel

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"nova-canvas-backend/internal/security"
)

type ProviderKind string

const (
	KindChat  ProviderKind = "chat"
	KindImage ProviderKind = "image"
	KindEdit  ProviderKind = "edit"
	KindAudio ProviderKind = "audio"
	KindVideo ProviderKind = "video"
)

// Provider describes an OpenAI-compatible endpoint that can be scheduled for a
// given capability. APIKey is never serialized to JSON responses.
type Provider struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Kind    ProviderKind `json:"kind"`
	BaseURL string       `json:"base_url"`
	APIKey  string       `json:"-"`
	Model   string       `json:"model"`
	Enabled bool         `json:"enabled"`
}

// ProviderRegistry holds the configured OpenAI-compatible providers. A built-in
// offline "mock" provider is always present so the system works without keys.
type ProviderRegistry struct {
	mu        sync.RWMutex
	providers map[string]*Provider
	order     []string
}

var (
	registryOnce sync.Once
	registryInst *ProviderRegistry
)

func defaultProviders() []*Provider {
	providers := []*Provider{
		{ID: "mock", Name: "Mock (offline)", Kind: KindChat, BaseURL: "", Model: "mock", Enabled: true},
	}
	raw := providerConfig()
	if raw != "" {
		var cfg []Provider
		if err := json.Unmarshal([]byte(raw), &cfg); err == nil {
			for i := range cfg {
				p := cfg[i]
				if p.ID == "" {
					p.ID = p.Name
				}
				if p.Model == "" {
					p.Model = "gpt-4o"
				}
				p.Enabled = true
				providers = append(providers, &p)
			}
		}
	}
	return providers
}

// providerConfig 读取供应商配置：优先 AI_PROVIDERS（明文），
// 其次 AI_PROVIDERS_ENC（AES-256-GCM 密文，密钥来自 NOVA_SECRET_KEY）。
// 加密配置用于避免 API Key 以明文躺在环境变量/编排文件里。
func providerConfig() string {
	if raw := os.Getenv("AI_PROVIDERS"); raw != "" {
		return raw
	}
	encoded := strings.TrimSpace(os.Getenv("AI_PROVIDERS_ENC"))
	if encoded == "" {
		return ""
	}
	box, err := security.LoadSecretBoxFromEnv()
	if err != nil {
		log.Printf("[WARN] AI_PROVIDERS_ENC ignored: invalid %s: %v", security.SecretKeyEnv, err)
		return ""
	}
	if box == nil {
		log.Printf("[WARN] AI_PROVIDERS_ENC ignored: %s is not set", security.SecretKeyEnv)
		return ""
	}
	plaintext, err := box.Open(encoded)
	if err != nil {
		log.Printf("[WARN] AI_PROVIDERS_ENC ignored: decryption failed")
		return ""
	}
	return plaintext
}

// Registry returns the process-wide provider registry (lazily initialized).
func Registry() *ProviderRegistry {
	registryOnce.Do(func() {
		r := &ProviderRegistry{providers: map[string]*Provider{}, order: []string{}}
		for _, p := range defaultProviders() {
			r.providers[p.ID] = p
			r.order = append(r.order, p.ID)
		}
		registryInst = r
	})
	return registryInst
}

func (r *ProviderRegistry) List() []*Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Provider, 0, len(r.order))
	for _, id := range r.order {
		out = append(out, r.providers[id])
	}
	return out
}

func (r *ProviderRegistry) Get(id string) *Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.providers[id]
}

// Default returns the first enabled, non-mock provider for a given kind.
func (r *ProviderRegistry) Default(kind ProviderKind) *Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, id := range r.order {
		p := r.providers[id]
		if p.Kind == kind && p.Enabled && p.ID != "mock" {
			return p
		}
	}
	return nil
}

// Chat resolves the provider (requested id, or default chat provider, or mock),
// then returns the reply and the id of the provider that actually served it.
func (r *ProviderRegistry) Chat(ctx context.Context, providerID string, messages []DeepSeekMessage) (string, string, error) {
	resolved := providerID
	var provider *Provider
	if providerID == "" {
		provider = r.Default(KindChat)
		if provider == nil {
			provider = r.Get("mock")
		}
		if provider != nil {
			resolved = provider.ID
		}
	} else {
		provider = r.Get(providerID)
		if provider == nil {
			provider = r.Get("mock")
			resolved = "mock"
		}
	}

	if provider == nil || provider.ID == "mock" || provider.APIKey == "" {
		return mockChat(messages), resolved, nil
	}

	reply, err := openAIChat(ctx, provider, messages)
	return reply, resolved, err
}

func mockChat(messages []DeepSeekMessage) string {
	last := ""
	for _, m := range messages {
		if m.Role == "user" {
			last = m.Content
		}
	}
	if last == "" {
		last = "(空)"
	}
	return fmt.Sprintf("[mock] 已收到你的消息：%s\n（当前为离线 Mock 模型，未配置外部 API Key，不会发起真实请求）", last)
}

func openAIChat(ctx context.Context, p *Provider, messages []DeepSeekMessage) (string, error) {
	payload := DeepSeekRequest{Model: p.Model, Messages: messages}
	body, _ := json.Marshal(payload)
	url := strings.TrimRight(p.BaseURL, "/") + "/chat/completions"

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request failed: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("provider call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("provider error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result DeepSeekResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("unmarshal failed: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from provider")
	}
	return result.Choices[0].Message.Content, nil
}
