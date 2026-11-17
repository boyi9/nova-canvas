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
// 也供 CI 的 commit-lint job 复用（同一份正则，本地钩子与 CI 兜底口径一致）：
//   node web/scripts/check-commit-msg.mjs --title "feat(web): xxx" --title "..."
// 应急绕过：git commit --no-verify（CI 的 commit-lint job 仍会拦，请勿常态化使用）。
// 终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import process from "node:process";

const MAX_HEADER = 100;
const TYPES = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"];
const PATTERN = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: .+$`);
const EXEMPT = /^(Merge |Revert |fixup! |squash! |amend! )/;

function printGuide() {
    console.error("[commit-msg]   expected: <type>(<scope>)?: <subject>");
    console.error('[commit-msg]   example:  "feat(web): 支持本地 HTTPS"');
    console.error(`[commit-msg]   types:    ${TYPES.join(" ")}`);
    console.error("[commit-msg]   header limit: 100 characters; merge/revert/fixup commits are exempt");
    console.error("[commit-msg]   emergency bypass: git commit --no-verify (CI commit-lint job still enforces)");
}

/** 返回 null 表示通过；否则返回违规原因。 */
function validateTitle(header) {
    if (!header || EXEMPT.test(header)) return null; // 空信息由 git 自身拒绝；豁免类型直接放行
    if (!PATTERN.test(header)) return "does not follow Conventional Commits";
    if (header.length > MAX_HEADER) return `header exceeds ${MAX_HEADER} characters (got ${header.length})`;
    return null;
}

const args = process.argv.slice(2);
const titles = [];
let file;
for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--title") {
        titles.push(args[++i] ?? "");
    } else if (arg.startsWith("--title=")) {
        titles.push(arg.slice("--title=".length));
    } else {
        file = arg;
    }
}

if (titles.length > 0) {
    const failures = [];
    for (const title of titles) {
        const reason = validateTitle(title.trim());
        if (reason) failures.push({ title: title.trim(), reason });
    }
    if (failures.length > 0) {
        console.error(`\n[commit-msg] ERROR: ${failures.length}/${titles.length} commit title(s) invalid`);
        for (const { title, reason } of failures) {
            console.error(`[commit-msg]   - "${title}": ${reason}`);
        }
        printGuide();
        process.exit(1);
    }
    console.log(`[commit-msg] OK: ${titles.length} commit title(s) valid.`);
    process.exit(0);
}

if (!file) {
    console.error("[commit-msg] ERROR: missing commit message file argument (or --title <value>)");
    process.exit(1);
}

// git 以仓库根为 cwd 调用钩子，$1 相对仓库根；解析为绝对路径，避免依赖调用方 cwd。
const rev = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
const messageFile = isAbsolute(file) || rev.status !== 0 ? file : join(rev.stdout.trim(), file);

let content;
try {
    content = readFileSync(messageFile, "utf8");
} catch {
    console.error(`[commit-msg] ERROR: cannot read commit message file: ${messageFile}`);
    process.exit(1);
}

const header = content.split(/\r?\n/, 1)[0].trim();
const reason = validateTitle(header);
if (reason) {
    console.error("\n[commit-msg] ERROR: commit message invalid: " + reason);
    console.error(`[commit-msg]   got: ${header}`);
    printGuide();
    process.exit(1);
}
process.exit(0);
