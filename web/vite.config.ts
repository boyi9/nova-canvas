import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

/**
 * 构建开关取值：.env.[mode] 里的文件值 < process.env（CI / 命令行可覆盖）。
 * 只有 VITE_ 前缀的变量会进入前端产物，BUILD_ 前缀仅在此配置内使用。
 */
function toBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value.trim() === "") return fallback;
    return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

/**
 * 本地 HTTPS：HTTPS=1 时读取自签名证书（由 `pnpm cert` 生成）。
 * 证书缺失时直接报错，避免 Vite 静默回退 HTTP，造成"以为开了 HTTPS"的误判。
 */
function loadHttpsOptions(enabled: boolean, certPath: string, keyPath: string) {
    if (!enabled) return undefined;
    if (!existsSync(certPath) || !existsSync(keyPath)) {
        throw new Error(["HTTPS is enabled but the certificate is missing.", `  cert: ${certPath}`, `  key:  ${keyPath}`, "Run `pnpm cert` first, or set HTTPS_CERT / HTTPS_KEY in web/.env.local."].join("\n"));
    }
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

/**
 * CSP 配置插件
 * - 开发环境：较宽松，允许热更新、localhost，并注入 meta tag
 * - 生产环境：严格 CSP 由 nginx 通过响应头下发，构建产物不注入 meta tag
 */
function cspPlugin(isDev: boolean): Plugin {
    const getCspHeader = (): string =>
        [
            "default-src 'self'",
            // Scripts - 开发环境允许 HMR 的内联注入与 eval；HTTPS 开发同样走 localhost
            `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval' http://localhost:* https://localhost:*" : ""}`,
            // Styles - Tailwind injects inline styles
            "style-src 'self' 'unsafe-inline'",
            // Fonts
            "font-src 'self' data: https://fonts.gstatic.com",
            // Images - picsum.photos 用于 demo 图片，blob: 用于本地上传预览
            "img-src 'self' data: blob: https://picsum.photos https://test-videos.co.uk",
            // Media (video/audio)
            "media-src 'self' blob: https://test-videos.co.uk",
            // Connect - API 请求（含 HTTPS 开发服务器与 HMR websocket）
            "connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*",
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
        configureServer(server) {
            server.middlewares.use((_req, res, next) => {
                res.setHeader("Content-Security-Policy", getCspHeader());
                next();
            });
        },
        transformIndexHtml(html) {
            if (!isDev) return html;
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

export default defineConfig(({ command, mode }) => {
    // 读取 .env / .env.[mode] / .env.local / .env.[mode].local
    const fileEnv = loadEnv(mode, webDir, "");
    const pick = (key: string, fallback = "") => (process.env[key] ?? fileEnv[key] ?? fallback).trim() || fallback;

    const isServe = command === "serve";
    const isProdBuild = command === "build" && mode === "production";

    // 本地 HTTPS（仅 dev / preview）：pnpm cert 生成证书后，在 .env.local 里设 HTTPS=1
    const httpsOptions = loadHttpsOptions(isServe && toBool(pick("HTTPS"), false), resolve(webDir, pick("HTTPS_CERT", "certs/dev-cert.pem")), resolve(webDir, pick("HTTPS_KEY", "certs/dev-key.pem")));

    // 生产构建：压缩 + 不保留 sourcemap + 压缩混淆；开发构建：保留 sourcemap、不压缩、不混淆
    const compressionEnabled = !isServe && toBool(pick("BUILD_COMPRESSION"), isProdBuild);
    const sourcemap = !isServe && toBool(pick("BUILD_SOURCEMAP"), !isProdBuild);
    const minify: boolean | "esbuild" = !isServe && toBool(pick("BUILD_MINIFY"), isProdBuild) ? "esbuild" : false;

    return {
        base: pick("VITE_BASE", "/"),
        plugins: [react(), localPluginsManifest(), cspPlugin(isServe), ...(compressionEnabled ? [compression({ algorithm: "gzip" }), compression({ algorithm: "brotliCompress" })] : [])],
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
            outDir: pick("BUILD_OUT_DIR", "dist"),
            sourcemap,
            minify,
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
            https: httpsOptions,
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
        preview: {
            https: httpsOptions,
        },
    };
});
