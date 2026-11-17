# 基础安全响应头，供各 server / location include。
#
# CSP 暂未在 nginx 下发：应用需要访问用户在设置里自定义的第三方 API / 图床域名，
# 静态 CSP 会直接打断这些请求。等运行时配置支持声明允许源后再启用响应头版本
# （开发环境的 CSP meta 见 web/vite.config.ts 的 cspPlugin，部署说明见根目录 DEPLOY.md）。

add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
