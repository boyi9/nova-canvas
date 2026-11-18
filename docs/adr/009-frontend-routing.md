# ADR 009：前端路由架构

- 状态：已采纳
- 日期：2026-11-17
- 相关代码：`web/src/router.tsx`、`web/src/router/routes.ts`、`web/src/components/common/RouteErrorPage.tsx`

## 背景

前端已使用 React Router v7 的 `createBrowserRouter`（data router），页面通过 `React.lazy` 拆包。此前存在以下维护风险：

- 路由路径直接写在 `router.tsx` 中，组件/埋点/分享链接各自拼接字符串；
- 没有路由级 `errorElement`，懒加载失败或布局异常会落到空白页；
- 错误边界职责不清：组件级与路由级混用。

## 决策

### 1. 路由表是唯一事实来源

- 静态路径统一放在 `web/src/router/routes.ts` 的 `ROUTES` 常量中；
- 动态路径提供 helper（如 `canvasProjectPath(id)`），内部做 `encodeURIComponent`；
- 页面、导航、埋点、分享链接不得硬编码路径字符串；
- `routes.test.ts` 校验路径唯一、以 `/` 开头、动态参数编码正确。

### 2. 页面加载约定

- 每个页面默认导出（`export default`），由 `router.tsx` 统一 `lazy(() => import(...))`；
- 页面级 loading 由统一的 `LazyPage` + `Suspense` 提供，页面内部不再包全局 loading；
- 重业务页面（画布工作台）保留 `React.lazy`；未来若需要 loader/action，再迁移到 route-level `lazy`，不在本次改动中混用两套机制。

### 3. 错误边界分层

| 层级 | 位置 | 职责 |
| --- | --- | --- |
| 路由级 | `errorElement: <RouteErrorPage />` | 懒加载失败、布局渲染异常、loader 异常；仍可导航回首页 |
| 工作台级 | `NovaWorkbenchErrorBoundary` | 工作台子树异常，保留导航壳 |
| 画布级 | `CanvasErrorBoundary` | 画布编辑器异常，避免整页崩溃 |
| 组件级 | `ModalErrorBoundary` 等 | 局部弹窗/面板降级 |

### 4. 鉴权守卫

当前前端尚未接入登录/刷新界面（`nova_token` 只读），因此**不添加假守卫**。接入认证时按以下顺序落地：

1. 在 `routes.ts` 为需要登录的路由增加 `requiresAuth` 元数据；
2. 在根路由增加 `AuthGuard`（读取会话状态，未登录重定向到登录页并携带 `returnTo`）；
3. 守卫只做 UI 层跳转，真正的权限校验始终在后端。

## 影响

- 新增页面需要同时更新 `routes.ts` 与 `router.tsx`，测试会阻止重复路径。
- `RouteErrorPage` 取代了此前缺失的全局兜底，降低白屏概率。
- 路由层不承担业务权限判断，避免前端守卫被误当作安全边界。
