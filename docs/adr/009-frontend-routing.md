# ADR 009：前端路由架构

- 状态：已采纳
- 日期：2026-11-17
- 相关代码：`web/src/router.tsx`、`web/src/router/routes.ts`、`web/src/router/lazy-pages.ts`、`web/src/components/common/RouteErrorPage.tsx`、`web/src/components/common/state-page.tsx`

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

- 每个页面默认导出（`export default`），在 `web/src/router/lazy-pages.ts` 统一 `lazy(() => import(...))`；
- `router.tsx` 只描述路由结构，不直接声明懒加载组件；
- 页面级 loading 由统一的 `LazyPage` + `Suspense` 提供，页面内部不再包全局 loading；
- 重业务页面（画布工作台）仍按路由级 `lazy` 拆包；未来若需要 loader/action，再迁移到 route-level `lazy`，不在本次改动中混用两套机制。

### 3. 无主壳路由

登录、引导与异常状态页不渲染 `UserLayout`（顶栏 + Agent 面板），在 `router.tsx` 中以 `SHELL_FREE_ROUTES` 平铺注册：

| 交付命名          | 实际路由                | 入口文件                                                      |
| ----------------- | ----------------------- | ------------------------------------------------------------- |
| `index.html`      | `/`                     | `web/index.html`（Vite 入口）+ `web/src/pages/nova/index.tsx` |
| `login.html`      | `/login`                | `web/src/pages/login/index.tsx`                               |
| `onboarding.html` | `/onboarding`           | `web/src/pages/onboarding/index.tsx`                          |
| 404               | 任意未匹配路径          | `web/src/pages/not-found/index.tsx`                           |
| 无权限            | `/403`                  | `web/src/pages/status/index.tsx`（`kind="forbidden"`）        |
| 空状态            | `/empty`                | 同上（`kind="empty"`）                                        |
| 加载中            | `/loading`              | 同上（`kind="loading"`）                                      |
| 维护中            | `/maintenance`          | 同上（`kind="maintenance"`）                                  |
| 网络错误          | `/network-error`        | 同上（`kind="networkError"`）                                 |
| 额度不足          | `/insufficient-credits` | 同上（`kind="insufficientCredits"`）                          |

说明：项目是 Vite + React SPA，页面由前端路由承载，不再新增独立 `.html` 文件；否则会绕过 `ROUTES`、错误边界与代码分割。异常状态页共用 `StatePage` 骨架，只通过 icon/tone/actions 区分。

### 4. 错误边界分层

| 层级     | 位置                               | 职责                                                  |
| -------- | ---------------------------------- | ----------------------------------------------------- |
| 路由级   | `errorElement: <RouteErrorPage />` | 懒加载失败、布局渲染异常、loader 异常；仍可导航回首页 |
| 工作台级 | `NovaWorkbenchErrorBoundary`       | 工作台子树异常，保留导航壳                            |
| 画布级   | `CanvasErrorBoundary`              | 画布编辑器异常，避免整页崩溃                          |
| 组件级   | `ModalErrorBoundary` 等            | 局部弹窗/面板降级                                     |

### 5. 鉴权守卫

当前前端尚未接入登录/刷新界面（`nova_token` 只读），因此**不添加假守卫**。接入认证时按以下顺序落地：

1. 在 `routes.ts` 为需要登录的路由增加 `requiresAuth` 元数据；
2. 在根路由增加 `AuthGuard`（读取会话状态，未登录重定向到登录页并携带 `returnTo`）；
3. 守卫只做 UI 层跳转，真正的权限校验始终在后端。

## 影响

- 新增页面需要同时更新 `routes.ts`、`lazy-pages.ts` 与 `router.tsx`，测试会阻止重复路径。
- `RouteErrorPage` 取代了此前缺失的全局兜底，降低白屏概率。
- 路由层不承担业务权限判断，避免前端守卫被误当作安全边界。
