# 部署基础

本文件覆盖本地开发与单机容器部署的 HTTPS、静态资源服务策略。生产集群 / CDN 方案不在本轮范围内。

## 1. 端口与入口

| 场景 | 命令 | 地址 |
| --- | --- | --- |
| 开发服务器（HTTP） | `cd web && pnpm dev` | http://localhost:5173 |
| 开发服务器（HTTPS） | `cd web && pnpm cert && HTTPS=1 pnpm dev` | https://localhost:5173 |
| 预览生产产物（HTTP） | `cd web && pnpm build && pnpm preview` | http://localhost:3000 |
| 预览生产产物（HTTPS） | `cd web && HTTPS=1 pnpm preview` | https://localhost:3000 |
| Docker（HTTP） | `docker compose -f docker-compose.local.yml up -d --build` | http://localhost:3000 |
| Docker（HTTPS） | `docker compose -f docker-compose.local.yml -f docker-compose.https.yml up -d --build` | https://localhost:3443 |

## 2. 本地 HTTPS（自签名证书）

### 2.1 生成证书

```bash
cd web
pnpm cert
```

产物：

- `web/certs/dev-cert.pem`（证书）
- `web/certs/dev-key.pem`（私钥，权限 600）

默认 SAN 覆盖 `localhost`、`127.0.0.1`、`::1` 以及本机所有局域网 IPv4，可直接用手机访问调试。追加自定义域名 / IP：

```bash
pnpm cert --force --host dev.local --ip 192.168.1.50
```

`web/certs/` 已在 `.gitignore` 与 `.dockerignore` 中排除，**不会入库、不会打进镜像**。

### 2.2 启用

在 `web/.env.local`（个人配置，不入库）中写：

```bash
HTTPS=1
# 可选：自定义证书位置（相对 web/）
# HTTPS_CERT=certs/dev-cert.pem
# HTTPS_KEY=certs/dev-key.pem
```

然后 `pnpm dev` / `pnpm preview`。证书缺失时 Vite 会直接报错并提示运行 `pnpm cert`，不会静默退回 HTTP。

HTTPS 下 HMR 自动走 `wss://`；开发环境的 CSP 已放行 `https://localhost:*` 与 `wss://localhost:*`。

### 2.3 信任证书（消除浏览器告警）

| 平台 | 命令 |
| --- | --- |
| Windows | `certutil -user -addstore Root web\certs\dev-cert.pem` |
| macOS | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain web/certs/dev-cert.pem` |
| Linux | `sudo cp web/certs/dev-cert.pem /usr/local/share/ca-certificates/nova-dev.crt && sudo update-ca-certificates` |

吊销 / 移除：Windows 在「管理用户证书 → 受信任的根证书颁发机构」删除 `Nova Canvas Development`；macOS 用「钥匙串访问」删除同名条目。

> 自签名证书仅用于本地调试。生产环境请使用正式证书，并在证书层启用 HSTS（见 5.2）。

## 3. Docker 静态资源服务

### 3.1 镜像结构

```
nginx:1.27-alpine
├── /usr/share/nginx/html          ← 前端构建产物（dist）
├── /etc/nginx/conf.d/default.conf ← HTTP :3000
├── /etc/nginx/conf.d/tls.conf     ← HTTPS :443（仅 compose 覆盖时挂载）
├── /etc/nginx/static.inc          ← 静态资源规则（两个 server 共用）
├── /etc/nginx/security-headers.inc
└── /docker-entrypoint.d/40-runtime-config.sh  ← 启动时生成 config.js
```

### 3.2 静态资源策略

| 路径 | Cache-Control | 说明 |
| --- | --- | --- |
| `/assets/*` | `public, max-age=31536000, immutable` | 文件名带哈希，可永久缓存 |
| `/index.html` | `no-cache` | 发版后必须重新校验 |
| `/config.js` | `no-store` | 运行期配置，改环境变量即时生效 |
| `/build-info.json` | `no-store` | 版本核对信息 |
| `/plugins/*` | `public, max-age=300` | 本地插件可能被替换 |
| 其余路径 | `no-cache` | SPA 回退入口 |

压缩：`gzip_static on` 直接命中构建产出的 `.gz`（每个 js/css/html 都有），未预压缩的资源走动态 `gzip`。
`.br` 需要 `ngx_brotli` 模块，官方镜像不含，本轮未启用；接入 CDN 或自编译镜像后再开。

安全响应头（所有响应）：`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`。

健康检查：`GET /healthz` → `200 ok`（不写访问日志）。

### 3.3 HTTPS 容器

```bash
cd web && pnpm cert && cd ..

# 首次访问自签名证书需在浏览器确认，或用 curl -k
curl -kI https://localhost:3443/
curl -kI https://localhost:3443/build-info.json
```

`docker-compose.https.yml` 只做三件事：映射 `3443:443`、挂载 `web/certs`、挂载 `docker/nginx/tls.conf`。
HTTP `:3000` 仍然保留，便于对比和回退。

## 4. 验证清单

```bash
# 1) 静态资源缓存头
curl -sI http://localhost:3000/index.html | grep -i cache-control     # no-cache
curl -sI http://localhost:3000/config.js  | grep -i cache-control     # no-store
curl -sI "http://localhost:3000/assets/$(ls web/dist/assets | grep '\.js$' | head -1)" \
  | grep -i cache-control                                             # immutable

# 2) 预压缩命中
curl -sI -H "Accept-Encoding: gzip" http://localhost:3000/assets/<file>.js | grep -i content-encoding

# 3) HTTPS
curl -kI https://localhost:3443/healthz     # 200
```

## 5. 上生产前的待办

1. **CSP**：当前只在开发环境通过 meta 注入。生产需要 nginx 响应头，但应用允许用户自定义第三方 API / 图床域名，静态 CSP 会打断这些请求；需先把允许源纳入运行期配置，再下发 `Content-Security-Policy`。
2. **HSTS**：正式证书就绪后再加
   `add_header Strict-Transport-Security "max-age=31536000" always;`（自签名阶段不要加）。
3. **Brotli**：需要 `ngx_brotli` 模块的镜像；接入 CDN 时由 CDN 负责。
4. **证书续期**：Let's Encrypt 用 certbot / acme.sh，续期后 `nginx -s reload`。
