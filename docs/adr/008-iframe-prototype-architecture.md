# ADR 008：原型/插件 iframe 架构 —— 单层沙箱与父子通信握手

- 状态：已采纳
- 日期：2026-11-17
- 相关代码：`web/src/lib/canvas/iframe-sandbox.ts`、`web/src/lib/canvas/iframe-protocol.ts`、`web/src/lib/canvas/iframe-sandbox-host.tsx`、`web/src/lib/canvas/plugin-iframe-loader.ts`、`plugins/canvas/html/src/index.tsx`

## 背景

仓库里只有两类 iframe：

1. **插件沙箱**（`createIframeSandbox`）：动态创建、不透明源、隐藏，承载第三方插件源码；
2. **HTML 节点预览**（`plugins/canvas/html`）：用 `srcDoc` 渲染用户 HTML，用于原型/页面预览。

两者此前的通信与隔离存在三个问题：

- 沙箱 `postMessage` 使用 `'*'` 作为 `targetOrigin`，仅靠 `event.source` 校验；
- iframe 未就绪时宿主发出的消息会丢失，没有握手与排队；
- RPC 超时定时器在响应到达后不清理，`destroy()` 也不会拒绝在途请求；
- HTML 预览文档没有 CSP，用户原型可以继续嵌套 iframe（多层嵌套）、提交表单或改写 base。

> 说明：仓库中不存在独立的「原型页面」模块，本文把「原型 iframe」定义为 HTML 节点中的原型预览 iframe。

## 决策

### 1. 单层沙箱，禁止嵌套

- 每个插件只有一个 iframe；插件之间、插件与宿主之间不得通过 iframe 嵌套共享上下文。
- 插件 iframe 保持 **不透明源**：`sandbox="allow-scripts allow-forms allow-popups"`，**永不**添加 `allow-same-origin` / `allow-popups-to-escape-sandbox`。
- HTML 原型预览是 **叶子帧**：注入 `Content-Security-Policy`，其中 `frame-src 'none'; child-src 'none'` 明确禁止再嵌套 iframe；`object-src/base-uri/form-action 'none'` 禁止对象嵌入、基址改写与表单外发。
- 预览帧不开启 `allow-same-origin` / `allow-top-navigation`，并设置 `referrerPolicy="no-referrer"`、`loading="lazy"`。

### 2. 父子通信：握手 + 会话令牌

不透明源的 `origin` 为 `"null"`，`postMessage(msg, origin)` 无法匹配，因此 `targetOrigin` 只能是 `'*'`。安全性不能依赖 `targetOrigin`，改为：

1. iframe 加载后向宿主发送 `{ type: 'handshake' }`；
2. 宿主校验 `event.source === iframe.contentWindow` 后，下发一次性随机 `session`；
3. 之后**每条**消息都必须携带匹配的 `session`，否则丢弃；
4. 握手完成前，双向消息进入各自的 outbox，握手后按序 flush；
5. iframe 在 flush 后发送 `iframe:ready`，宿主只处理一次 ready 并标记可用；
6. RPC 30s 超时；响应/错误到达即清除定时器；`destroy()` 拒绝所有在途请求并清理监听器。

协议类型与常量集中在 `iframe-protocol.ts`，host 侧运行时字符串与 TS 侧共享同一套语义。

### 3. 能力调用仍由宿主鉴权

`postMessage` 只传方法名与参数，不传凭据。所有 `canvas:*` / `ai:*` / `storage:*` 调用都经 `handlePluginRequest` → 能力校验 → `hostBridge` 执行，插件无法绕过权限直接访问宿主。

## 影响

- 插件作者无需感知握手：`window.__PluginRuntime` 在运行时内部完成排队与令牌注入。
- 原型中嵌套 `iframe` 将不再渲染（`frame-src 'none'`），这是刻意的安全取舍。
- 新增 iframe 必须复用 `createIframeSandbox`；禁止在业务组件里直接 `document.createElement('iframe')` 承载不可信内容。

## 待办

- 若未来需要「原型多页面预览」，应使用**同级**路由/预览面板切换，而不是在预览帧内再嵌套 iframe。
- CSP 目前允许远程图片/字体（原型需要）；如需更严格隔离，可改为白名单域名。
