#!/usr/bin/env node
// 安装 / 修复 husky v9 钩子。本仓库是「git 根在上一级、本包在 web/ 子目录」的布局，
// husky 9 要求 .git 位于当前目录，所以 prepare 里直接跑 `husky --dir .husky`
// 会报 ".git can't be found"，且 bin.js 无论成败都 exit 0，问题被静默吞掉——
// 这正是钩子一直处于休眠状态（core.hooksPath 未设置）的原因。
//
// 正确做法（与 husky 官方「项目不在 git 根」的方案等价）：
//   从仓库根目录调用 husky，并传入相对根目录的 web/.husky，
//   使 core.hooksPath 指向 web/.husky/_（git 以仓库根解析相对 hooksPath）。
//
// 触发时机：pnpm install（prepare 脚本）；也可手动 node scripts/setup-hooks.mjs。
// 跳过条件：HUSKY=0（Docker 构建已设置）或不在 git 检出内。
// 终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

import { webDir } from "./lib/fsx.mjs";

if (process.env.HUSKY === "0") {
    console.log("[hooks] HUSKY=0 set, skipping hook install.");
    process.exit(0);
}

const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
if (gitRoot.status !== 0 || !gitRoot.stdout.trim()) {
    console.log("[hooks] not a git checkout, skipping hook install.");
    process.exit(0);
}
const root = gitRoot.stdout.trim();

const huskyBin = join(webDir, "node_modules", "husky", "bin.js");
if (!existsSync(huskyBin)) {
    console.error("[hooks] ERROR: husky is not installed (web/node_modules/husky missing).");
    console.error("[hooks] Run: pnpm install");
    process.exit(1);
}

// relative(root, webDir) => "web"；hooks 目录相对仓库根写作 "web/.husky"。
const hooksDir = `${relative(root, webDir).split(sep).join("/")}/.husky`;

const result = spawnSync(process.execPath, [huskyBin, hooksDir], { cwd: root, encoding: "utf8" });
const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
if (output) console.log(`[hooks] husky: ${output}`);

const check = spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: root, encoding: "utf8" });
const hooksPath = (check.stdout || "").trim();
if (hooksPath !== `${hooksDir}/_`) {
    console.error(`[hooks] ERROR: core.hooksPath is "${hooksPath}", expected "${hooksDir}/_"`);
    process.exit(1);
}
console.log(`[hooks] OK: core.hooksPath=${hooksPath}`);
console.log("[hooks] Real hooks live in web/.husky/; web/.husky/_ is generated locally (gitignored).");
