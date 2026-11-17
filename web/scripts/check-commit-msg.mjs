#!/usr/bin/env node
// 校验提交信息是否符合 Conventional Commits（宽松版）：
//
//   <type>(<scope>)?: <subject>          scope 可选
//   feat(web): 支持本地 HTTPS            中文 subject 完全允许
//   fix(canvas)!: 修复 xx               ! 表示 breaking change
//
// 允许的 type：build chore ci docs feat fix perf refactor revert style test
// 约束：header（第一行）不超过 100 字符；scope 只用小写字母数字与 -_/.。
// 豁免：Merge / Revert / fixup! / squash! / amend! 开头的提交不做校验。
//
// 由 web/.husky/commit-msg 调用：
//   node web/scripts/check-commit-msg.mjs <commit-msg-file>
// $1 是 git 传入的提交信息文件（如 .git/COMMIT_EDITMSG），相对仓库根。
// 应急绕过：git commit --no-verify（请勿常态化使用）。
// 终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import process from "node:process";

const MAX_HEADER = 100;
const TYPES = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"];
const PATTERN = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: .+$`);
const EXEMPT = /^(Merge |Revert |fixup! |squash! |amend! )/;

function fail(header) {
    console.error("\n[commit-msg] ERROR: commit message does not follow Conventional Commits");
    console.error(`[commit-msg]   got:      ${header}`);
    console.error("[commit-msg]   expected: <type>(<scope>)?: <subject>");
    console.error('[commit-msg]   example:  "feat(web): 支持本地 HTTPS"');
    console.error(`[commit-msg]   types:    ${TYPES.join(" ")}`);
    console.error("[commit-msg]   header limit: 100 characters; merge/revert/fixup commits are exempt");
    console.error("[commit-msg]   emergency bypass: git commit --no-verify");
    process.exit(1);
}

// git 以仓库根为 cwd 调用钩子，$1 相对仓库根；解析为绝对路径，避免依赖调用方 cwd。
const arg = process.argv[2];
if (!arg) {
    console.error("[commit-msg] ERROR: missing commit message file argument");
    process.exit(1);
}
const rev = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
const file = isAbsolute(arg) || rev.status !== 0 ? arg : join(rev.stdout.trim(), arg);

let content;
try {
    content = readFileSync(file, "utf8");
} catch {
    console.error(`[commit-msg] ERROR: cannot read commit message file: ${file}`);
    process.exit(1);
}

const header = content.split(/\r?\n/, 1)[0].trim();
if (!header || EXEMPT.test(header)) process.exit(0); // 空信息由 git 自身拒绝；豁免类型直接放行
if (!PATTERN.test(header)) fail(header);
if (header.length > MAX_HEADER) {
    console.error("\n[commit-msg] ERROR: commit header exceeds 100 characters");
    console.error(`[commit-msg]   length: ${header.length}`);
    console.error(`[commit-msg]   got:    ${header}`);
    console.error("[commit-msg]   tip: move details into the commit body (second paragraph).");
    process.exit(1);
}
process.exit(0);
