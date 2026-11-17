# 构建 Vite 前端产物（pnpm，与本地 web/pnpm-lock.yaml 保持一致）。
FROM node:22-alpine AS web-build

# HUSKY=0：镜像内没有 .git，跳过 husky 安装钩子
ENV HUSKY=0 \
    CI=true

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

WORKDIR /app/web

# 先只拷贝依赖清单，命中依赖层缓存
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN pnpm build

# 运行镜像：只启动静态前端，AI 请求由浏览器前台直连用户自己的接口。
FROM nginx:1.27-alpine

COPY --from=web-build /app/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# HTTP / HTTPS（compose 覆盖时挂载 tls.conf）共用的静态服务与安全头片段
COPY docker/nginx/static.inc /etc/nginx/static.inc
COPY docker/nginx/security-headers.inc /etc/nginx/security-headers.inc
COPY web/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
# 防御性处理：即使宿主把脚本检出成 CRLF，也统一改成 LF 后再赋予执行权限
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-runtime-config.sh && chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 3000
EXPOSE 443
