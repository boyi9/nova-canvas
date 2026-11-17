#!/usr/bin/env node
// 跨平台同时启动 mock API 与 Vite dev server。
// 原脚本用 `node ... & vite ...`，`&` 在 PowerShell / cmd 下不可用，这里改为 Node 子进程编排。
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { webDir } from "./lib/fsx.mjs";

const mockScript = join(webDir, "server", "mock-api.mjs");
const viteBin = join(webDir, "node_modules", "vite", "bin", "vite.js");
const devPort = process.env.PORT || "5173";

if (!existsSync(mockScript)) {
    console.error(`\n[dev:mock] ERROR: mock API not found: ${mockScript}`);
    process.exit(1);
}
if (!existsSync(viteBin)) {
    console.error('\n[dev:mock] ERROR: Vite not found. Run "pnpm install" in web/ first.');
    process.exit(1);
}

const children = [];
let shuttingDown = false;

function killTree(child) {
    if (!child.pid) return;
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
        child.kill("SIGTERM");
    }
}

function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) killTree(child);
    process.exit(code);
}

function start(label, args, extraEnv = {}) {
    const child = spawn(process.execPath, args, {
        cwd: webDir,
        env: { ...process.env, ...extraEnv },
        stdio: "inherit",
    });
    child.on("error", (error) => {
        console.error(`\n[dev:mock] ${label} failed to start: ${error.message}`);
        shutdown(1);
    });
    child.on("exit", (code, signal) => {
        if (shuttingDown) return;
        // 任一进程退出就整体退出，避免留下孤儿 dev server。
        console.log(`\n[dev:mock] ${label} exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
        shutdown(code ?? 1);
    });
    children.push(child);
    return child;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// 端口约定与 vite.config.ts 的 /api/v1 代理保持一致（MOCK_PORT 默认 4174）。
start("mock API", [mockScript]);
start("Vite dev server", [viteBin, "--host", "0.0.0.0", "--port", devPort]);
