# ADR 012：基础图元渲染（矩形、圆形、文本、图片）

- 状态：已采纳
- 日期：2026-11-20
- 相关代码：`web/src/types/canvas.ts`、`web/src/constant/canvas.ts`、`web/src/components/canvas/nodes/builtin-nodes.tsx`、`web/src/components/canvas/nodes/ShapeNode.tsx`、`web/src/components/canvas/nodes/shape-geometry.ts`、`web/src/components/canvas/canvas-node.tsx`

## 背景

基础图元阶段需要让画布真正画出矩形、圆形、文本和图片。文本与图片已有节点渲染器，矩形/圆形没有对应节点类型，也没有统一的尺寸、样式和渲染约定：

- 若直接在画布层画形状，形状与节点树脱节，无法复用选择、拖拽、缩放、连线、持久化；
- 若为形状单独维护一套尺寸逻辑，会与 `createCanvasNode`、最小尺寸、等比缩放产生分叉；
- 形状需要透明底色，否则节点卡片的外框和底部渐变会盖住矢量内容。

## 决策

### 1. 图元仍然是节点

矩形与圆形注册为内置节点类型 `rectangle` / `circle`，复用现有节点能力：创建菜单、拖拽、框选、缩放、连线、复制粘贴、持久化、小地图。

- 尺寸与标题写在 `NODE_DEFAULT_SIZE` / `NODE_SPECS`，由 `createCanvasNode` 统一居中创建；
- 形状节点标记 `transparentBackground: true`，节点卡片不画底色和边框，选中/相关态仍由外壳的蓝色描边表达；
- 圆形节点声明 `keepAspectRatio: () => true`，拖拽缩放手柄时保持 1:1；
- 形状节点不自动打开生成面板，避免创建后弹出一个与图元无关的对话框。

### 2. 样式存元数据，使用世界坐标单位

`CanvasNodeMetadata` 新增：

| 字段           | 含义         | 默认值    |
| -------------- | ------------ | --------- |
| `fill`         | SVG 填充色   | `#dbeafe` |
| `stroke`       | SVG 描边色   | `#2563eb` |
| `strokeWidth`  | 描边宽度     | `2`       |
| `cornerRadius` | 矩形圆角半径 | `16`      |

数值先经 `resolveShapeStyle` 清洗：非有限值回退默认，负数夹到 0；`cornerRadius` 再按短边的一半夹取。描边宽度是世界单位，缩放画布时描边与图元一起缩放，后续导出无需换算。

### 3. SVG 绘制与几何计算分离

`shape-geometry.ts` 导出纯函数 `getShapeGeometry` 负责“节点尺寸 + 样式 → SVG 几何”，`ShapeNode.tsx` 只保留组件导出以兼容 Fast Refresh：

- 矩形：按 `strokeWidth / 2` 内缩，避免居中描边被节点边界裁掉；
- 圆形：同一内缩规则下输出椭圆参数，节点非正方形时仍能正确绘制；
- 所有负数/非有限尺寸归零，保证 SVG 属性始终合法。

渲染端只消费几何结果，用 `viewBox="0 0 width height"` 输出 `<rect>` / `<ellipse>`。测试直接断言纯函数与 SVG 属性，不依赖截图。

### 4. 文本与图片保持不变

文本沿用 `TextContent`（双击进入编辑、`fontSize`/`fontColor` 等元数据），图片沿用 `ImageNodeContent`（`object-contain` 显示、批次展开、下载/重试）。本阶段只补画布级验收，不重写既有渲染器。

## 影响

- 新增图元类型时必须同时补齐 `NODE_DEFAULT_SIZE`、`NODE_SPECS`、`nodeContentRenderers` 三处 `satisfies Record<CanvasNodeType, ...>`，类型检查会兜底；
- `shape-geometry.test.ts` 固定几何与样式清洗行为；`web/e2e/canvas-shapes.spec.ts` 覆盖矩形/圆形创建与 SVG 属性、圆形等比缩放、文本草稿渲染、图片上传渲染；
- 画布容器由 `overflow-hidden` 改为 `overflow-clip`：浏览器在聚焦画布内元素时不会滚动容器，避免世界层整体偏移破坏“视口属性 ↔ 屏幕坐标”的一致性；
- 形状样式目前通过元数据设置，尚未提供可视化属性面板；后续若加面板，直接写回上述字段即可，无需改渲染器。
