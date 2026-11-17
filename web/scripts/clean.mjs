#!/usr/bin/env node
// 清理构建产物。
//   pnpm clean        只清 dist
//   pnpm clean:all    额外清 Vite 预构建缓存、覆盖率、Playwright 产物
// 终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { join } from "node:path";
import process from "node:process";

import { formatBytes, removeDir, resolveInsideWeb, webDir } from "./lib/fsx.mjs";

const args = new Set(process.argv.slice(2));
const deep = args.has("--all") || args.has("-a");

let targets;
try {
    targets = [
        {
            label: "dist output",
            dir: resolveInsideWeb(process.env.BUILD_OUT_DIR || "dist", { label: "Output dir" }),
        },
    ];

    if (deep) {
        targets.push({ label: "Vite deps cache", dir: join(webDir, "node_modules", ".vite") }, { label: "Vitest coverage", dir: join(webDir, "coverage") }, { label: "Playwright artifacts", dir: join(webDir, "test-results") });
    }
} catch (error) {
    console.error(`[clean] ERROR: ${error.message}`);
    process.exit(1);
}

console.log(deep ? "[clean] Removing build output and local caches..." : "[clean] Removing build output...");

let freed = 0;
for (const { label, dir } of targets) {
    const { removed, files, bytes } = removeDir(dir);
    freed += bytes;
    const detail = removed ? `${files} files, ${formatBytes(bytes)}` : "not found, skipped";
    console.log(`[clean] ${removed ? "OK" : "--"} ${label}: ${detail}`);
}

console.log(`[clean] Done. Freed ${formatBytes(freed)}.`);
