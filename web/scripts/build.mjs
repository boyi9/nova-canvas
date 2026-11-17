#!/usr/bin/env node
// pnpm build 的封装入口，负责把「清理 → 构建 → 校验 → 统计」串成一条可复现的命令：
//   1. 清空旧产物，避免上一轮文件残留（Vite 也会清空 outDir，这里额外给出体量日志）
//   2. 以当前 Node 直接调用本地 vite build（不经过 shell，Windows/macOS/Linux 行为一致）
//   3. 校验关键产物（index.html / assets / plugins 清单 / 运行时 config.js）
//   4. 输出体积统计并写入 dist/build-info.json，便于部署时确认版本
//
// 用法：
//   node scripts/build.mjs [--mode production|development] [--out-dir dist]
// 环境变量：
//   BUILD_MODE        默认 production
//   BUILD_OUT_DIR     默认 dist
//
// 说明：终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

import { formatBytes, removeDir, resolveInsideWeb, walkFiles, webDir } from "./lib/fsx.mjs";

const USAGE = `Usage: node scripts/build.mjs [options]

  --mode <production|development>  Build mode (default: production)
  --out-dir <dir>                  Output dir relative to web/ (default: dist)
  -h, --help                       Show this help

Env: BUILD_MODE / BUILD_OUT_DIR`;

// 按扩展名分组统计；br/gz/map 必须排在 js/css 前面，否则 a.js.br 会被算进 js。
const GROUPS = [
    { key: "br", label: "Brotli", exts: [".br"] },
    { key: "gz", label: "Gzip", exts: [".gz"] },
    { key: "map", label: "Source maps", exts: [".map"] },
    { key: "html", label: "HTML", exts: [".html"] },
    { key: "css", label: "CSS", exts: [".css"] },
    { key: "js", label: "JavaScript", exts: [".js", ".mjs"] },
];

function fail(message) {
    console.error(`\n[build] ERROR: ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    const options = {
        mode: process.env.BUILD_MODE || "production",
        outDir: process.env.BUILD_OUT_DIR || "dist",
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "-h" || arg === "--help") {
            console.log(USAGE);
            process.exit(0);
        } else if (arg.startsWith("--mode=")) {
            options.mode = arg.slice("--mode=".length);
        } else if (arg === "--mode") {
            options.mode = argv[index + 1] ?? "";
            index += 1;
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = arg.slice("--out-dir=".length);
        } else if (arg === "--out-dir") {
            options.outDir = argv[index + 1] ?? "";
            index += 1;
        } else {
            fail(`Unknown argument: ${arg}\n\n${USAGE}`);
        }
    }

    if (!options.mode) fail("--mode requires a value");
    if (!options.outDir) fail("--out-dir requires a value");
    return options;
}

function summarize(dir) {
    const files = walkFiles(dir);
    const groups = Object.fromEntries(GROUPS.map(({ key }) => [key, { files: 0, bytes: 0 }]));
    const largest = [];
    let bytes = 0;

    for (const file of files) {
        const size = statSync(file).size;
        bytes += size;
        const lower = file.toLowerCase();
        const group = GROUPS.find(({ exts }) => exts.some((ext) => lower.endsWith(ext)));
        if (group) {
            groups[group.key].files += 1;
            groups[group.key].bytes += size;
        }
        if (!lower.endsWith(".br") && !lower.endsWith(".gz") && !lower.endsWith(".map")) {
            largest.push({ file: relative(dir, file).split(sep).join("/"), size });
        }
    }

    largest.sort((a, b) => b.size - a.size);
    return { files: files.length, bytes, groups, largest: largest.slice(0, 8) };
}

function gitShortSha() {
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: webDir, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
}

function readIfExists(file) {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const options = parseArgs(process.argv.slice(2));
let outDir;
try {
    outDir = resolveInsideWeb(options.outDir, { label: "Output dir" });
} catch (error) {
    fail(error.message);
}
const outDirLabel = options.outDir.replace(/\\/g, "/");
const startedAt = Date.now();

console.log(`\n[build] Nova Canvas  mode=${options.mode}  outDir=${outDirLabel}`);

const cleaned = removeDir(outDir);
console.log(cleaned.removed ? `[build] Cleaned ${outDirLabel}: ${cleaned.files} files, ${formatBytes(cleaned.bytes)}` : `[build] ${outDirLabel} not found, nothing to clean`);

const viteBin = join(webDir, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
    fail(`Vite not found (${viteBin}). Run "pnpm install" in web/ first.`);
}

const env = { ...process.env };
// 开发模式构建：让 React 与 import.meta.env.DEV 走开发分支，便于线上复现问题。
// 只在 mode=development 且外部未指定 NODE_ENV 时生效，生产构建保持 Vite 默认行为。
if (options.mode === "development" && !env.NODE_ENV) env.NODE_ENV = "development";

console.log(`[build] Running: vite build --mode ${options.mode} --outDir ${outDirLabel}\n`);

const build = spawnSync(process.execPath, [viteBin, "build", "--mode", options.mode, "--outDir", outDir], {
    cwd: webDir,
    env,
    stdio: "inherit",
});
if (build.error) fail(`Failed to start Vite: ${build.error.message}`);
if (build.status !== 0) {
    fail(`Build failed (exit code ${build.status ?? "unknown"}); ${outDirLabel} may be incomplete.`);
}

// ── 产物校验 ────────────────────────────────────────────────
const required = [
    { label: "index.html", path: join(outDir, "index.html") },
    { label: "assets/ directory", path: join(outDir, "assets") },
];
const optional = [
    { label: "plugins/index.json (local plugin manifest)", path: join(outDir, "plugins", "index.json") },
    { label: "config.js (runtime config injection point)", path: join(outDir, "config.js") },
    { label: "logo.svg", path: join(outDir, "logo.svg") },
];

for (const item of required) {
    if (!existsSync(item.path)) fail(`Missing ${item.label} in output (${item.path}); build is unusable.`);
}
for (const item of optional) {
    if (!existsSync(item.path)) console.warn(`[build] WARN: missing ${item.label}; check public/ and plugin config.`);
}

// ── 统计与构建信息 ──────────────────────────────────────────
const buildInfoPath = join(outDir, "build-info.json");
const pkg = JSON.parse(readFileSync(join(webDir, "package.json"), "utf8"));
const buildInfo = {
    name: pkg.name,
    packageVersion: pkg.version,
    appVersion: readIfExists(join(webDir, "..", "VERSION")).trim() || null,
    mode: options.mode,
    nodeEnv: env.NODE_ENV || "production",
    commit: gitShortSha(),
    builtAt: new Date().toISOString(),
    outDir: outDirLabel,
};
// 先写入构建信息，再统计，保证日志里的文件数与磁盘一致
writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

const summary = summarize(outDir);
const duration = Date.now() - startedAt;
writeFileSync(buildInfoPath, `${JSON.stringify({ ...buildInfo, files: summary.files, bytes: summary.bytes }, null, 2)}\n`, "utf8");

console.log(`\n[build] OK in ${(duration / 1000).toFixed(1)}s`);
const plural = (count) => `${count} file${count === 1 ? "" : "s"}`;
console.log(`[build] Output: ${outDirLabel} - ${plural(summary.files)}, ${formatBytes(summary.bytes)}`);
for (const { key, label } of GROUPS) {
    const group = summary.groups[key];
    if (group.files > 0) {
        console.log(`[build]   ${label.padEnd(12)} ${String(group.files).padStart(3)} files  ${formatBytes(group.bytes)}`);
    }
}
if (summary.largest.length > 0) {
    console.log("[build] Largest files:");
    for (const [index, item] of summary.largest.entries()) {
        console.log(`[build]   ${index + 1}. ${formatBytes(item.size).padStart(9)}  ${item.file}`);
    }
}
console.log(`[build] Build info: ${outDirLabel}/build-info.json (mode=${buildInfo.mode}, nodeEnv=${buildInfo.nodeEnv})`);

if (options.mode === "production" && summary.groups.br.files === 0 && summary.groups.gz.files === 0) {
    console.warn("[build] WARN: production build has no .br/.gz output; check BUILD_COMPRESSION.");
}
