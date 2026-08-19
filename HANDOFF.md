# HANDOFF.md — 双端接力交接单（OpenCode ⇄ Continue）

> **用途**：聊天历史在 OpenCode 与 Continue 之间不互通。真正的"交接"必须落盘为
> **文件 + git commit + 本单**。任何一方准备把工作交给另一端前，填写本文件；
> 接棒方开工前先读本文件与最近的 `git log`。
>
> 完整项目约定见 `AGENTS.md`；任务状态以 `C:\board-import\` 的 jira/feishu/github 为准。

---

## 当前状态（交棒方填写）
- **交棒自**：OpenCode / Continue
- **进行中任务**：`<taskKey 或 条目，如 S1-W3-D4-03>`
- **Git 分支**：`<branch>`
- **最近 commit**：`<hash> — <message>`

## 已完成
- 

## 进行中（未提交 / 未完成）
- 

## 下一步（接棒方该做什么）
- [ ] 
- [ ] 

## 关键上下文 / 已踩的坑
- 

## 待同步看板
- jira / feishu / github 状态：`<DONE / 进行中 / 阻塞>`
- 如需更新，改 `C:\board-import\` 对应 JSON 并保持一致（三端应同为 11 条）

---

### 使用约定
- 切换工具前：把上面内容填好并 `git commit`（message 含 `[handoff]` 便于检索）。
- 接手工具时：先 `git log --oneline -10`、读 `HANDOFF.md`、再读 `AGENTS.md` 相关章节。
- 本文件只保留**最新一次**交接；每次交棒覆盖更新即可。
