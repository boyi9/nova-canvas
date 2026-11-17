# 静态资源服务规则（HTTP 与 HTTPS 两个 server 共用，由 /etc/nginx/*.inc 引入）
#
# 说明：
#   - 构建已生成 .gz 预压缩产物，gzip_static 直接命中，避免运行期压缩开销；
#   - Brotli（.br）需要 ngx_brotli 模块，官方 nginx 镜像不含，故这里只启用 gzip；
#   - add_header 在同一层级会覆盖父级继承，因此每个带 Cache-Control 的 location
#     都重新 include 一次安全头。

root /usr/share/nginx/html;
index index.html;

gzip_static on;
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types text/plain text/css application/javascript application/json application/manifest+json image/svg+xml;

# 入口 HTML：发布后必须立即生效，不能长缓存
location = /index.html {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}

# 带内容哈希的构建产物：文件名变了 URL 就变，可以放心长缓存
location /assets/ {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
}

# 运行期配置由容器启动时生成，改环境变量后需即时生效
location = /config.js {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "no-store" always;
    try_files $uri =404;
}

# 构建信息用于核对线上版本，同样不能缓存
location = /build-info.json {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "no-store" always;
    try_files $uri =404;
}

# 本地插件可能被替换成新版本，用短缓存折中
location /plugins/ {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "public, max-age=300" always;
    try_files $uri =404;
}

# 容器编排 / 负载均衡健康检查
location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\n";
}

# SPA 回退：其余路径都交给前端路由
location / {
    include /etc/nginx/security-headers.inc;
    add_header Cache-Control "no-cache" always;
    try_files $uri $uri/ /index.html;
}
