import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

/**
 * CSP 配置插件
 * - 开发环境：较宽松，允许热更新、localhost
 * - 生产环境：严格 CSP，由 nginx 通过 Header 设置，此处仅开发环境注入 meta tag
 */
function cspPlugin(): Plugin {
    let config: { command: string };

    const isDev = () => config.command === "serve";

    const getCspHeader = (): string => [
        "default-src 'self'",
        // Scripts - 开发环境允许 unsafe-eval (Vite HMR) 和 localhost
        `script-src 'self' ${isDev() ? "'unsafe-eval' http://localhost:*" : ""}`,
        // Styles - Tailwind injects inline styles
        "style-src 'self' 'unsafe-inline'",
        // Fonts
        "font-src 'self' data: https://fonts.gstatic.com",
        // Images - picsum.photos 用于 demo 图片，blob: 用于本地上传预览
        "img-src 'self' data: blob: https://picsum.photos https://test-videos.co.uk",
        // Media (video/audio)
        "media-src 'self' blob: https://test-videos.co.uk",
        // Connect - API 请求
        "connect-src 'self' http://localhost:* ws://localhost:*",
        // Frames - 沙箱 iframe
        "frame-src 'self' blob:",
        // Workers
        "worker-src 'self' blob:",
        // Base URI
        "base-uri 'self'",
        // Form action
        "form-action 'self'",
    ].join("; ");

    return {
        name: "csp-plugin",
        configResolved(resolvedConfig) {
            config = resolvedConfig;
        },
        configureServer(server) {
            server.middlewares.use((_req, res, next) => {
                res.setHeader("Content-Security-Policy", getCspHeader());
                next();
            });
        },
        transformIndexHtml(html) {
            if (!isDev()) return html;
            // 开发环境：注入 CSP meta tag
            return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${getCspHeader()}">`);
        },
    };
}

// Expose /plugins/index.json with local plugin files from public/plugins.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [
        react(),
        localPluginsManifest(),
        cspPlugin(),
        compression({ algorithm: "gzip" }),
        compression({ algorithm: "brotliCompress" }),
    ],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    "vendor-react": ["react", "react-dom", "react-router", "react-router-dom"],
                    "vendor-antd": ["antd", "@ant-design/icons", "@ant-design/pro-components"],
                    "vendor-state": ["zustand", "@tanstack/react-query"],
                    "vendor-utils": ["dayjs", "nanoid", "uuid", "clsx", "tailwind-merge"],
                },
            },
        },
    },
    server: {
        proxy: {
            // Python 后端（FastAPI, backend/main.py）——NC-CAP 模型路由/生成/留痕、host 接缝总线、pro 管线
            "/api/model": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/host": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/pro": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/billing": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/export": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/projects": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            "/api/health": {
                target: `http://localhost:${process.env.BACKEND_PORT || 8000}`,
                changeOrigin: true,
            },
            // 前端 Mock server（mock-api.mjs）——其余 /api/v1 业务
            "/api/v1": {
                target: `http://localhost:${process.env.MOCK_PORT || 4174}`,
                changeOrigin: true,
            },
        },
    },
});