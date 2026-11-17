# 贡献指南（Git 工作流）

本文件约定提交信息格式、git hooks、lint-staged 增量检查与 lint warning 基线。
CI 门禁（typecheck / lint / test / build + `CI success` 聚合）定义见 `.github/workflows/ci.yml`。

## 1. 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 宽松版：

```
<type>(<scope>)?: <subject>          scope 可选，中文 subject 允许
<空行>
<正文：说明动机与副作用，可写中文>
```

| 项              | 规则                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| type            | `build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `revert` `style` `test` |
| scope           | 可选，小写字母数字与 `-_/.`，如 `web` `ci` `deploy` `canvas`                       |
| breaking change | type 后加 `!`（如 `fix(canvas)!: ...`），正文注明迁移方式                          |
| header 长度     | ≤ 100 字符，细节放正文（钩子会强制校验）                                           |
| 语言            | 中英皆可，subject 用祈使句概括「做了什么」                                         |

真实示例（本仓库近期提交）：

```
chore(web): 构建链自动化——build/clean 脚本封装 + dev/prod 环境变量拆分
ci: PR 基础门禁（typecheck/lint/test/build + CI success 聚合）+ 修复 11 个 lint error
fix(collab): 权限预检 + 403 本地化 + 红线确认一致性 + 无障碍细节
```

豁免（不校验格式）：`Merge ...`、`Revert ...`、`fixup!`、`squash!`、`amend!` 开头的提交。

校验由 `web/.husky/commit-msg` → `web/scripts/check-commit-msg.mjs` 执行。
应急绕过：`git commit --no-verify`（请勿常态化使用；CI 会再拦一次 lint，但**不会**校验提交信息格式）。

## 2. Git hooks（husky v9）

本仓库是「git 根在仓库顶层、前端包在 `web/` 子目录」的布局，husky 官方要求 `.git` 在当前目录，
因此钩子安装由自定义脚本完成（`pnpm install` 时自动触发）：

```
web/.husky/pre-commit     ← 真实钩子（入库，无扩展名）
web/.husky/commit-msg     ← 真实钩子（入库，无扩展名）
web/.husky/_/             ← husky 本地生成（.gitignore 全忽略，勿提交勿手改）
core.hooksPath = web/.husky/_    ← git 以仓库根解析相对路径（安装脚本负责设置）
```

- 安装：`cd web && pnpm install`（`prepare` 脚本 → `scripts/setup-hooks.mjs`），或手动 `node scripts/setup-hooks.mjs`
- 跳过安装：`HUSKY=0`（Docker 构建已内置）；临时跳过单次钩子：`git commit --no-verify`
- hook 文件由 `/bin/sh` 直接执行，已通过 `.gitattributes`（`**/.husky/**`）强制 LF，勿改成 CRLF
- 新克隆若没跑过 `pnpm install`，钩子不会生效——husky 的 `core.hooksPath` 是本地仓库配置，不入库

## 3. lint-staged 增量检查（pre-commit）

只检查**本次暂存**的文件（`web/` 目录内）：

| 文件                                     | 处理                                |
| ---------------------------------------- | ----------------------------------- |
| `*.ts` `*.tsx` `*.js` `*.mjs` `*.cjs`    | `eslint --fix` + `prettier --write` |
| `*.json` `*.css` `*.md` `*.yml` `*.yaml` | `prettier --write`                  |

行为约定：

- **error 阻断提交**（修复或暂存后重试）；`--fix` / `--write` 自动改的内容会重新暂存
- **warning 不阻断**：仓库存在 501 条历史 warning（见第 4 节），`--max-warnings 0` 的旧配置会把
  任何碰过历史代码的提交全部挡住，已移除。error 的底线由钩子守，warning 的底线由 CI 守
- 配置在 `web/package.json` 的 `lint-staged` 字段；钩子从 `web/` 目录运行，仓库根等外部文件不在此检查范围

## 4. lint warning 基线（ratchet，只降不升）

全仓存量 warning 约 **501 条**（大头：`@typescript-eslint/no-unused-vars` 231、
`react-hooks/*` 72、`no-explicit-any` 47）。门禁策略：

```jsonc
// web/package.json
"lint:ci": "eslint . --max-warnings 501"
```

- `lint:ci` 要求 **error 必须为 0**；warning 总数不得超过基线 `501`
- **基线只降不升**：任何新增 warning 都会挤占存量配额，导致别人清理时数字对不上
- 清理 warning 后必须**同步下调** `501`：
  1. `cd web && pnpm lint` 末行会输出当前 `n problems (0 errors, N warnings)`
  2. 把 `package.json` 的 `--max-warnings 501` 改成 `N`，连同修复一起提交（type 用 `chore(web)`）
- 目标：随分批清理逐步降到 0，之后可移除 `--max-warnings` 改为硬约束
- 临时调试代码（`console.log` 等）勿合入——它们计入配额

## 5. 分支与合并

- `main` 受分支保护：PR 合并要求 1 个 approval、**唯一 required check 为 `CI success`**
  （聚合 typecheck / lint / test / build 四项；其余 workflow 的结果不阻塞合并）
- 合并前保证分支基于最新 `main`（保护规则已开启 up-to-date 检查）
