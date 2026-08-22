# 协同开发测试任务：创建一个简单的 Canvas 节点类型扩展

## 任务描述
创建一个新的 Canvas 节点类型 `NovaTextNode`，支持富文本编辑功能。

## 验收标准
1. ✅ 在 `web/src/components/canvas/nodes/` 下创建 `NovaTextNode.tsx`
2. ✅ 实现基本的富文本编辑功能（加粗、斜体、下划线）
3. ✅ 在 `builtin-nodes.tsx` 中注册该节点类型
4. ✅ 编写对应的单元测试
5. ✅ 通过 `pnpm test` 验证

## 协同分工
- **OpenCode (云端)**：生成任务规格、架构设计、代码骨架
- **Continue (本地)**：实现具体功能、编写测试、本地验证
- **同步方式**：Git + GitHub，通过 HANDOFF.md 交接

---

## 阶段 1：OpenCode 生成规格和骨架

### 节点类型设计
```typescript
// NovaTextNode.tsx 设计规格
interface NovaTextNodeProps {
  node: CanvasNode;
  onUpdate: (data: Partial<NodeData>) => void;
  selected: boolean;
  viewport: ViewportTransform;
}

// 功能需求：
// 1. 富文本编辑器（基于 contenteditable 或 textarea）
// 2. 工具栏：加粗、斜体、下划线、字号、颜色
// 3. 支持键盘快捷键
// 4. 自动保存到节点数据
```

---

## 阶段 2：Continue 实现

待 Continue 接手实现...

---

## 交接记录
- 创建时间：2026-08-22
- 交棒方：OpenCode
- 接棒方：Continue
- 状态：规格完成，待实现