# Sprint 1 Week 1 任务执行指南（详细版）

> 基于 `board-import/v1.0-20250101-tasks.csv` 与 `Sprint1-W1-Deliverables.md` 生成，供本地/云端开发直接参考

---

## 任务清单

| 任务ID | 任务名称 | 详细执行指令 | 验收标准 | 交付路径 |
| --- | --- | --- | --- | --- |
| S1-W1-D1-01 | INFRA-001 CI流水线搭建-GitHub Actions配置 | 1. 复用已提供的INFRA-001代码模板，生成 `.github/workflows/sync-upstream.yml` 自动同步上游nova-canvas主库的Workflow文件<br>2. 配置每日凌晨2点UTC自动触发同步，合并冲突时自动创建PR并@项目负责人，合并成功后自动运行全量回归测试<br>3. 生成对应的单元测试文件、README验收清单文档 | Workflow文件语法合法，定时触发正常，手动触发可用，冲突自动创建PR，测试失败阻断合并 | `.github/workflows/sync-upstream.yml` + `src/infra/ci-pipeline/INFRA-001/` 完整目录 |
| S1-W1-D1-02 | INFRA-001 CI流水线搭建-合并冲突自动处理 | 扩展Workflow逻辑，增加自动冲突检测、冲突分支自动命名、冲突通知自动推送至项目群的能力 | 合并出现冲突时100%生成带conflict标签的PR，自动标记相关负责人 | 复用INFRA-001目录，更新同步逻辑 |
| S1-W1-D1-03 | INFRA-001 CI流水线搭建-全量回归测试集成 | 接入后续生成的回归测试脚本，上游合并成功后自动触发全量回归测试，测试不通过时自动终止合并流程 | 回归测试执行失败时完全阻断后续合并，输出测试失败报告到Actions日志 | 复用INFRA-001目录，集成测试执行步骤 |
| S1-W1-D2-01 | INFRA-002 拉取原生仓库全量单测用例 | 复用已提供的INFRA-002代码模板，实现浅克隆nova-canvas上游主库、自动提取所有测试用例文件、解析describe/it/test测试套件的能力 | 完整提取上游所有测试文件，生成`test-manifest.json`清单，记录文件路径、用例名、行号 | `src/infra/regression/INFRA-002/` 完整目录 |
| S1-W1-D2-02 | INFRA-002 建立回归测试基线 | 运行提取到的所有上游原生测试用例，建立初始通过基线，将失败用例分类记录，生成基线对比报告 | 所有通过的用例记录入基线库，失败用例自动标记风险等级 | 输出`tests/regression/upstream/run-baseline.sh`一键脚本 |
| S1-W1-D3-01 | INFRA-002 回归测试自动化脚本编写 | 编写全量回归测试一键执行脚本，自动对比本次测试结果与基线差异，生成可视化差异报告 | 运行脚本后自动输出全量测试报告，通过率与基线偏差超过5%时自动告警 | 回归测试脚本集成到CI流水线 |
| S1-W1-D4-01 | CANVAS-001 画布核心引擎兼容性分析 | 复用已提供的CANVAS-001代码模板，扫描上游源码所有核心模块，导出模块依赖关系、复杂度、风险等级，生成兼容性分析报告 | 输出高/中/低风险模块分类清单，识别所有破坏性变更，生成按严重度排序的迁移指南 | `src/canvas/compat/CANVAS-001/` 完整目录 + 输出`COMPATIBILITY_ANALYSIS.md`报告 |
| S1-W1-D4-02 | CANVAS-001 画布核心能力兼容改造-渲染引擎 | 基于兼容性分析报告，适配nova-canvas核心渲染引擎，保证节点拖拽、缩放、连线、小地图功能完全正常，性能无回退 | 100个节点同时操作无卡顿，FPS稳定在60以上，所有原生画布交互功能可用 | 前端画布渲染层改造完成，提交PR合并到develop分支 |
| S1-W1-D5-01 | CANVAS-001 画布核心能力兼容改造-状态管理 | 适配撤销重做、导入导出、多画布项目管理核心能力，保证历史操作栈不溢出，导入导出数据无损 | 连续100步操作撤销重做无报错，导出的JSON文件重新导入后100%还原画布状态 | 状态管理层改造完成 |
| S1-W1-D5-02 | CANVAS-001 历史画布迁移验证 | 编写历史画布项目自动迁移脚本，验证所有nova-canvas历史创建的项目都可以无缝导入新版本 | 100份随机生成的历史画布项目全部导入成功，无数据丢失 | 历史迁移脚本完成，通过全量验证 |

---

## 依赖关系图

```
S1-W1-D1-01 → S1-W1-D1-02 → S1-W1-D1-03 → S1-W1-D2-01 → S1-W1-D2-02 → S1-W1-D3-01
                                                                    ↓
S1-W1-D4-01 ← S1-W1-D4-02 ← S1-W1-D5-01 ← S1-W1-D5-02 ← INFRA-002
```

---

## 快速启动命令（VS Code Continue）

| Task | 命令 |
|------|------|
| INFRA-001 核心生成 | `/gen-infra001` |
| INFRA-002 核心生成 | `/gen-infra002` |
| CANVAS-001 核心生成 | `/gen-canvas001` |
| 单测补全 | `/gen-test` |
| PR 审查 | `/review-pr` |
| 看板同步 | `/sync-board` |
| Go API 生成 | `/gen-go-api` |
| GPU Runner 校验 | `/run-local-verify` |

---

## 验收检查清单（每 Task 通用）

- [ ] 代码实现完整，无 TODO/FIXME
- [ ] 单测覆盖率 ≥ 80%（`pnpm test` / `go test ./...`）
- [ ] Lint 通过（`eslint` / `golangci-lint`）
- [ ] 无新增非 MIT 依赖（`review-pr` 自动扫描）
- [ ] Swagger/TSDoc 注释完整
- [ ] 看板任务标记 DONE（`/sync-board`）
- [ ] ADR 记录关键决策（`/adr`）

---

## 参考文件

- **骨架代码**：`Sprint1-W1-Deliverables.md` (及 part01~part07.md)
- **任务 CSV**：`board-import/v1.0-20250101-tasks.csv`
- **编码规范**：`.continue/knowledge/coding-rules.md`
- **启动清单**：`LAUNCH-3DAYS.md`