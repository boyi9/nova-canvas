# 协同开发测试任务：Canvas 节点类型扩展 — NovaTextNode

## 任务描述
创建一个新的 Canvas 节点类型 `NovaTextNode`，支持富文本编辑功能。

## 验收标准
1. ✅ 在 `web/src/components/canvas/nodes/` 下创建 `NovaTextNode.tsx`
2. ✅ 实现基本的富文本编辑功能（加粗、斜体、下划线、字号、颜色）
3. ✅ 在 `builtin-nodes.tsx` 中注册该节点类型
4. ⚠️ 单元测试：待安装 vitest 框架后编写（`web/` 目录当前无测试框架）
5. ⚠️ 渲染器接线：组件已实现但未被画布渲染器实际调用（见下方状态说明）

## 协同分工
- **OpenCode (云端)**：生成任务规格、架构设计、代码骨架、dispatch 路由规则
- **Continue (本地)**：实现具体功能、编写测试、本地验证
- **同步方式**：Git + GitHub，通过 HANDOFF.md 交接

---

## 当前状态 (2026-08-25)

### 已完成
| 项目 | 状态 | 说明 |
|------|------|------|
| NovaTextNode.tsx 实现 | ✅ 已完成 | 191行，富文本编辑器（contentEditable），工具栏（加粗/斜体/下划线/字号/颜色），快捷键支持 |
| builtin-nodes.tsx 注册 | ✅ 已完成 | `CanvasNodeType.NovaText` 已注册，label='富文本'，category='basic'，icon='FileText' |
| editorRef 双重绑定修复 | ✅ 已修复 | 移除外层 div 的 `ref={editorRef}`，保留内层 contentEditable 的 ref（尚未提交） |

### 未完成 / 阻塞
| 项目 | 状态 | 阻塞原因 |
|------|------|----------|
| 渲染器接线 | ❌ 未接线 | `builtin-nodes.tsx` 使用 `registerNodeDefinitions()` 注册，无 `component` 字段。NovaText 渲染由画布内部 canvas-node 渲染器处理，需要调查渲染器如何选择组件。 |
| 单元测试 | ❌ 未编写 | `web/` 目录无测试框架（无 vitest/jest），`package.json` 无 test script。需先安装 vitest（需用户确认）。 |
| NovaText 画布节点类型注册 | ⚠️ 需确认 | `CanvasNodeType.NovaText` 值需确认是否与渲染器内部映射一致。 |

### 关键文件
- **组件**：`web/src/components/canvas/nodes/NovaTextNode.tsx` (191行)
- **注册**：`web/src/components/canvas/nodes/builtin-nodes.tsx` (line 25)
- **类型**：`web/src/types/canvas.ts` — `CanvasNodeType` 枚举

---

## 架构说明

### 组件结构
```
NovaTextNode.tsx
├── 工具栏 (Toolbar)
│   ├── 加粗/斜体/下划线按钮
│   ├── 字号选择 (12-72px)
│   └── 颜色选择器
├── 内容编辑区 (contentEditable div)
│   └── 富文本内容 (HTML)
└── 状态管理
    ├── localText: string (本地编辑状态)
    └── isEditing: boolean (编辑模式标记)
```

### 注册方式
```typescript
// builtin-nodes.tsx
registerNodeDefinitions([
  {
    type: CanvasNodeType.NovaText,
    label: '富文本',
    category: 'basic',
    icon: 'FileText',
    description: '富文本节点，支持加粗、斜体、下划线、字号和颜色设置',
    defaultWidth: 200,
    defaultHeight: 100,
  },
]);
```

### 待解决问题
渲染器如何将 `CanvasNodeType.NovaText` 映射到 `NovaTextNode` 组件？需要调查：
1. 画布渲染器的组件选择逻辑
2. `registerNodeDefinitions()` 是否支持 `component` 字段
3. 或者需要通过其他机制（如动态 import）注册组件

---

## 交接记录
- 创建时间：2026-08-22
- 最后更新：2026-08-25
- 交棒方：OpenCode
- 接棒方：Continue
- 状态：组件实现完成，渲染器接线待调查，测试待安装框架

---

## 下一步行动
1. **调查渲染器接线**：研究画布渲染器如何选择组件，确定 NovaTextNode 的接线方式
2. **安装 vitest**：在 `web/` 目录安装 vitest 测试框架（需用户确认）
3. **编写单元测试**：覆盖工具栏操作、快捷键、内容保存等场景
4. **提交代码**：将 editorRef 修复和 NovaTextNode 一起提交