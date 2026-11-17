# Security Policy

## Supported Versions

nova-canvas is in active development. Security fixes are accepted for the
`main` branch and the latest tagged release. Older versions may be handled on a
best-effort basis.

## Reporting a Vulnerability

Please do not open a public issue with exploit details, credentials, private
API keys, proof-of-concept code, or screenshots that reveal sensitive data.

Preferred reporting channels:

1. Use GitHub private vulnerability reporting or a GitHub Security Advisory for
   this repository, if available.
2. If a private GitHub report is not available, email `1844025705@qq.com` with
   the subject `[nova-canvas security]`.
3. If neither private channel is available, open a public issue that asks for a
   private contact channel and does not include technical exploit details.

Please include:

- Affected version, commit, branch, or deployment mode.
- Clear reproduction steps.
- Impact and attack scenario.
- Any relevant logs, screenshots, or proof of concept, with secrets removed.
- Whether the issue affects local-only usage, hosted deployments, browser
  storage, WebDAV sync, AI provider configuration, or API proxy behavior.

## Scope

### Canvas node plugins

The canvas supports third-party node plugins loaded from a remote URL. By
design, an installed plugin's code runs directly inside the web app with full
access to the page, including locally stored data such as AI API keys. This is
an intentional trade-off for extensibility, and the installer shows a warning
before installing. Therefore:

- Only install plugins from sources you trust.
- Reports that a *malicious plugin* can access page data or API keys are **out
  of scope** — that is the documented behavior of the trust model.
- Reports **in scope** include: the app loading/executing plugin code without
  the install confirmation, a plugin escaping its declared node type to break
  core app integrity in ways not implied by "runs in the page", or the plugin
  source cache being writable by an unrelated origin.

Examples of in-scope reports:

- Cross-site scripting or token exfiltration in the web app.
- Exposure of locally stored API keys or synced canvas data caused by project
  code.
- Unsafe file handling, import/export behavior, or WebDAV proxy behavior.
- Authentication, authorization, or access-control flaws in project-managed
  features.
- Supply-chain issues that are exploitable through this repository's shipped
  code or default configuration.

Examples that are usually out of scope:

- Vulnerabilities in third-party AI providers, model APIs, hosting platforms,
  or browser extensions outside this repository.
- Compromise of a user's own API key outside the app.
- Denial-of-service reports that require unrealistic traffic volume or physical
  access to the user's device.
- Missing security headers without a demonstrated exploit path.
- Social engineering, phishing, spam, or account recovery requests.
- Dependency reports without a practical impact on this project.

## Disclosure

The maintainers aim to acknowledge valid reports within 7 days and coordinate a
fix before public disclosure. Response and fix timelines are best effort for
this community project.

Please allow time for investigation and remediation before publishing details.
Credit will be given on request unless you prefer to remain anonymous.

---

# 安全基线（实现说明）

以下内容描述 Nova Canvas **Go 后端**（`backend/`）的安全模型与运行要求。`web/backend/`（Python 服务）不在本节范围内。

## 1. 令牌模型

### 访问令牌（Access Token）

| 项目 | 说明 |
| --- | --- |
| 格式 | JWT，HS256（服务端强制校验算法，拒绝 `alg=none` / HS512 等） |
| 签名密钥 | `JWT_SECRET`，**至少 32 字节**，启动时校验，缺失或过短直接退出 |
| 有效期 | `JWT_ACCESS_TTL`，默认 `15m`，上限 `24h` |
| 载荷 | `user_id`、`email`、`typ=access`、`iss`、`sub`、`iat`、`nbf`、`exp` |
| 校验 | 算法白名单 + issuer + 必须存在 `exp`（5 秒时钟容差）+ `typ` 必须为 `access` |
| 传输 | `Authorization: Bearer <token>` |

访问令牌**无状态**，服务端不保存。需要立即失效时，请轮换 `JWT_SECRET`（所有已签发令牌同时失效）。

### 刷新令牌（Refresh Token）

- 不透明随机值：32 字节（256 bit），base64url 编码，不含任何用户信息。
- 数据库只保存 **SHA-256 哈希**（`refresh_tokens.token_hash`），明文仅下发给浏览器 Cookie。
- **轮换式**：每次刷新都会撤销旧令牌并签发新令牌；旧令牌立即失效。
- **重放检测**：已撤销的令牌再次出现视为泄露信号，立即撤销该用户的**全部**刷新令牌（所有设备被登出）。
- 有效期：`JWT_REFRESH_TTL`，默认 `720h`（30 天）。
- 清理：仅在登录/刷新时删除**自然过期**的记录；已撤销记录保留到过期，用于重放检测。

### 刷新令牌 Cookie

| 属性 | 值 |
| --- | --- |
| 名称 | `nova_refresh` |
| `HttpOnly` | 是（JS 无法读取） |
| `SameSite` | `Lax` |
| `Path` | `/api/v1/auth`（业务请求不携带） |
| `Secure` | `AUTH_COOKIE_SECURE`，**生产环境（HTTPS）必须为 `true`** |
| `Domain` | `AUTH_COOKIE_DOMAIN`（可选，前后端不同子域时填写，如 `.example.com`） |

刷新接口额外要求请求头 `X-Requested-With: XMLHttpRequest`。跨站表单无法携带自定义头，配合 `SameSite=Lax` 构成 CSRF 纵深防御。

### 认证接口

| 接口 | 说明 |
| --- | --- |
| `POST /api/v1/auth/register` | 注册并直接建立会话 |
| `POST /api/v1/auth/login` | 登录 |
| `POST /api/v1/auth/refresh` | 用 Cookie 中的刷新令牌换取新的访问令牌（需 `X-Requested-With`） |
| `POST /api/v1/auth/logout` | 撤销当前刷新令牌并清除 Cookie，始终返回 `204` |

登录/注册响应同时包含 `access_token`、旧字段 `token`、`token_type`、`expires_in` 和 `user`，旧客户端无需改动即可继续使用。

### 密码

- 使用 bcrypt（`bcrypt.DefaultCost`）存储，不可逆。
- 密码策略：`min=8`，`max=72`（bcrypt 输入上限）。

## 2. 传输与浏览器防护

- **CORS**：仅回显 `CORS_ALLOWED_ORIGINS` 白名单中的来源，始终发送 `Vary: Origin`；允许携带凭据（`Access-Control-Allow-Credentials: true`），因此**禁止 `*`**，配置为 `*` 时启动失败。非白名单来源的预检请求返回 `403`。
- **安全响应头**（所有 API 响应）：
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Cache-Control: no-store`
- **限流**：注册/登录/刷新按客户端 IP 做令牌桶限流（`RATE_LIMIT_RPS` 默认 `5`，`RATE_LIMIT_BURST` 默认 `10`），超限返回 `429` 与 `Retry-After`。默认**不信任** `X-Forwarded-For`；经 nginx 等反向代理部署时，用 `TRUSTED_PROXIES`（逗号分隔 IP/CIDR，例如 `127.0.0.1`）显式声明代理地址，否则所有请求会被视为同一 IP。
- **前端 CSP**：开发服务器由 `web/vite.config.ts` 配置；生产环境由部署侧反向代理按需下发（仓库内 `nginx.conf` 目前未设置 CSP，若接入第三方 API 域名请自行补充 `connect-src`）。前端 BYOK（用户自带 API Key）只存在于浏览器本地，不经过后端存储。

## 3. 越权防护（对象级权限）

- 所有业务接口都挂在 `Auth` 中间件之后，未携带有效 Bearer 访问令牌一律 `401`。公开端点白名单仅限：`register`、`login`、`refresh`、`logout`、`health`。
- **对象级权限**：项目、生成任务、配方（recipes）、脚本（scripts）均按归属用户隔离；访问他人资源一律返回 `404`（同时不泄露资源是否存在）。相关行为由单测锁定（`ownership_test.go`、`auth_test.go`）。
- 生成任务状态接口按 `task_id` 查询时校验 `gen.UserID` 与当前用户一致。
- 服务端脚本执行（`/scripts/:id/run`、`/scripts/run`）仅限登录用户，脚本在 Goja 沙箱内运行并受资源限制约束。
- 新增接口时必须：1) 挂到 `auth` 路由组；2) 明确资源归属校验；3) 补充越权用例。

## 4. 注入防护

- **SQL 注入**：数据访问全部使用 GORM 参数化查询，仓库内没有 `Raw` / 字符串拼接 SQL。新增查询必须使用占位符（`Where("email = ?", email)`），禁止 `fmt.Sprintf` 拼接语句。
- **JSON/参数注入**：生成参数（`width`/`style` 等）统一经 `json.Marshal` 编码后入库，不再拼接字符串，避免引号/反斜杠破坏结构。
- **XSS**：文本节点渲染进 `contentEditable` 前会转义 `& < > " '`（`web/src/components/canvas/nodes/NovaTextNode.tsx`）。任何使用 `dangerouslySetInnerHTML` 的新代码都必须先转义或用受信任的渲染器。

## 5. 敏感数据加密

需要**可取回**的敏感配置（如供应商 API Key）使用 AES-256-GCM 加密，密钥来自 `NOVA_SECRET_KEY`（32 字节，base64url 无填充）。

```bash
# 1) 生成密钥
go run ./cmd/secretctl genkey

# 2) 加密明文（AI_PROVIDERS 的 JSON 内容）
go run ./cmd/secretctl seal --value '[{"id":"deepseek","name":"DeepSeek","kind":"chat","base_url":"https://api.deepseek.com","api_key":"sk-...","model":"deepseek-chat"}]'

# 3) 把输出填入 AI_PROVIDERS_ENC，并删除 AI_PROVIDERS 明文
```

- 启动时优先读取 `AI_PROVIDERS`（明文）；未设置时读取 `AI_PROVIDERS_ENC` 并解密。
- `NOVA_SECRET_KEY` 缺失或格式错误时，`AI_PROVIDERS_ENC` 会被忽略并打印警告（服务仍可用，只是没有额外供应商）。
- 密文带 `v1:` 版本前缀，便于将来平滑更换算法。
- **不要**对密码、刷新令牌等不需要取回的数据使用此加密：密码用 bcrypt，刷新令牌用 SHA-256。

## 6. 密钥与配置管理

- 所有秘密只来自**运行期环境变量**，仓库不提交 `.env`（根 `.gitignore` 已忽略），生产镜像也不再打包 `.env.example`。
- **禁止硬编码密钥**：源码、配置、文档中不得出现真实 API Key / 密码 / 令牌；秘密一律经环境变量注入。测试夹具只允许占位值（如 bcrypt dummy hash）。
- 代码中不硬编码任何密钥；数据库不存储供应商 API Key（只来自环境变量，可选 AES-256-GCM 密文）。
- 落库的敏感数据及其保护方式：用户密码 → bcrypt；刷新令牌 → SHA-256 哈希；供应商配置 → 环境变量（可选 `AI_PROVIDERS_ENC` 密文）。业务数据（项目、生成记录）为用户内容，不做字段级加密。
- 必填：`JWT_SECRET`。推荐同时设置：`AUTH_COOKIE_SECURE=true`、`CORS_ALLOWED_ORIGINS`、`NOVA_SECRET_KEY`。
- 环境变量清单见 `backend/.env.example`。
- 轮换影响：
  - 轮换 `JWT_SECRET`：所有访问令牌立即失效，用户重新登录即可（刷新令牌仍有效）。
  - 轮换 `NOVA_SECRET_KEY`：需用新密钥重新 `seal` 并更新 `AI_PROVIDERS_ENC`，否则该配置无法解密。
- 生产建议：密钥由编排平台 Secret 注入，不写入镜像、日志或构建产物。

## 7. 本地验证

```bash
cd backend
go vet ./...
go test ./...
go build ./...
```

CI 中的 `Backend Tests` job 会执行 `go vet` 与 `go test`，并与 `CI success` 聚合门禁联动。
