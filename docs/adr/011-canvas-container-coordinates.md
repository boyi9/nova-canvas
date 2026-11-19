# ADR 011：画布容器坐标系统与 DPI 适配

- 状态：已采纳
- 日期：2026-11-19
- 相关代码：`web/src/lib/canvas/viewport.ts`、`web/src/lib/canvas/dpr.ts`、`web/src/hooks/use-device-pixel-ratio.ts`、`web/src/components/canvas/nova-canvas.tsx`、`web/src/pages/canvas/project.tsx`、`web/src/components/canvas/canvas-mini-map.tsx`

## 背景

画布容器此前把视口数学散落在多个组件里，存在四类隐患：

- 初始化不一致：项目默认 `viewport` 为 `{ x: 0, y: 0, k: 1 }`，加载时又被保存值覆盖，导致新画布的世界原点贴在容器左上角，而不是居中；
- 坐标系重复实现：`screenToCanvas`、可见节点裁剪、小地图矩形、滚轮锚点缩放各写一份公式，改动时容易漏改；
- 尺寸变化漂移：侧边栏折叠或窗口缩放后视口不平移，容器中心对应的世界坐标发生偏移，画布内容看起来“跳了一下”；
- 高分屏网格发虚：网格位置使用未对齐的小数，1px 线落在设备像素之间，出现灰边和摩尔纹。

## 决策

### 1. 统一坐标定义

| 坐标 | 原点 | 单位 | 用途 |
| --- | --- | --- | --- |
| 世界坐标 world | 画布内容原点 | 与节点尺寸一致 | 节点位置/宽高、连线锚点、持久化 |
| 屏幕坐标 screen | 画布容器左上角 | CSS 像素 | 网格、小地图、命中测试 |
| 客户端坐标 client | 浏览器视口左上角 | CSS 像素 | 指针事件（`clientX/clientY`） |

唯一变换公式：

```text
screen = world * k + (x, y)
world  = (screen - (x, y)) / k
```

`ViewportTransform { x, y, k }` 中 `x/y` 是屏幕平移量，`k` 是缩放比例。所有换算集中在 `viewport.ts`，组件不得再手写公式。

### 2. 视口初始化

- 新建画布：世界原点落在容器中心，缩放 100%，即 `createInitialViewport(width, height)`；
- 旧数据 `{ x: 0, y: 0, k: 1 }` 视为“未设置”，加载时按容器尺寸居中；
- 已保存的非默认视口优先，首次测量不得覆盖；
- 持久化/导入数据先经 `sanitizeViewport`，非有限数值回退到世界原点，`k` 夹取到允许范围。

### 3. 缩放与平移

- 缩放范围 `0.05 – 5`（`MIN_ZOOM` / `MAX_ZOOM`），所有入口统一经 `clampZoom`；
- 滚轮因子 `1.1^(-deltaY / 100)`，以指针位置为锚点（`zoomAtScreenPoint`），锚点下的世界坐标保持不动；
- 缩放滑杆以容器中心为锚点（`setZoomAtScreenPoint`）；
- 聚焦节点使用 `fitViewportToBounds(..., { paddingRatio: 0.2, maxZoom: 1 })`，节点占容器约 60%，小节点最多放大到 100%；
- 平移使用 `panViewportBy`，只改 `x/y`，不动 `k`。

### 4. 可见区域与容器尺寸变化

- 可见世界矩形由 `getVisibleWorldRect` 计算；节点渲染外扩 280 世界单位，避免拖拽时边缘闪白；
- 容器尺寸变化（侧栏折叠、窗口缩放、分屏）通过 `resizeViewport` 保持容器中心的世界坐标不变，不改变缩放；
- 小地图的视口矩形与拖动居中复用同一组函数，不再单独维护公式。

### 5. DPI 适配

- 布局、命中测试、`ViewportTransform` 全部使用 CSS 像素；
- `<canvas>` 的位图缓冲区使用 `getCanvasBackingSize` 按 `devicePixelRatio` 放大，并通过 `resizeCanvasBackingStore` 同步 CSS 尺寸与 `setTransform(dpr, 0, 0, dpr, 0, 0)`；
- 设置 `canvas.width/height` 会重置变换矩阵，因此 DPI 变换必须在调整尺寸之后设置；
- 网格间距与偏移使用 `snapToDevicePixel` 对齐设备像素，消除高分屏 1px 线的半像素模糊；
- `useDevicePixelRatio` 监听 `(resolution: Ndppx)` 与 `resize`，浏览器缩放或跨屏拖动后自动重算；
- 当前主画布是 DOM + CSS transform，节点内容本身是矢量/图片，不需要位图缩放；DPI 工具主要服务于网格清晰度与后续栅格图层。

## 影响

- 新增画布相关交互时必须复用 `web/src/lib/canvas/viewport.ts`，避免公式分叉；
- `viewport.test.ts` 与 `dpr.test.ts` 固定坐标系、缩放锚点、尺寸变化和 DPI 换算行为；
- 旧的 `{0,0,1}` 项目首次打开会居中显示，这是有意的行为修正，不影响已保存的非默认视口；
- 若未来把画布改为 `<canvas>` 渲染，只需在绘制前使用 `resizeCanvasBackingStore`，世界/屏幕坐标约定保持不变。
