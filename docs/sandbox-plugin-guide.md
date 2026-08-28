# 第三方沙箱插件开发指南

> 适用版本：nova-canvas 沙箱插件系统（iframe 隔离 + 声明式面板）。
> 配套示例：`web/public/plugins/sandbox-sample.json`

## 1. 概览

nova-canvas 允许以 **iframe 沙箱** 方式运行第三方插件。核心安全与架构特性：

- **隔离**：插件在 **不透明源（opaque origin，`window.origin === 'null'`）** 的 iframe 中运行，刻意不带 `allow-same-origin`，因此无法读取父页面 DOM / cookie / localStorage，也不能通过 `allow-popups-to-escape-sandbox` 逃逸。
- **不进主上下文**：插件源码仅通过 `srcdoc` 注入到 iframe 内执行，宿主 **绝不 `eval`** 插件源码到主上下文。
- **通信仅走 postMessage**：插件与宿主之间所有调用/事件都通过 `postMessage` 的 RPC/事件协议完成。宿主校验每条消息的 `event.source` 仅接受自身 iframe。
- **能力声明 + 授权**：插件在 manifest 中声明所需的 `capabilities`，宿主按风险等级决定是否弹窗请求用户授权；授权结果按插件 ID 持久化。
- **声明式 UI**：在 `ui:render` 能力下，插件向宿主推送可序列化的 `SandboxPanelView`，由宿主渲染面板（**不把 React 组件塞进 JSON 信封**）。

## 2. 插件信封（JSON）

插件以一份 JSON 信封分发，包含受信任的 `plugin` 描述符与不可信的 `source` 代码：

```json
{
  "plugin": {
    "id": "your-plugin-id",
    "name": "示例插件",
    "version": "0.1.0",
    "description": "一句话说明插件做什么",
    "capabilities": ["canvas:read", "ai:generate", "ui:render"],
    "css": ".tip{color:#22c55e}"
  },
  "source": "(function(){ /* 插件入口代码，可使用 window.__PluginRuntime */ })();"
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `plugin.id` | 是 | 插件唯一标识，权限按此 ID 持久化 |
| `plugin.name` / `version` | 是 | 展示用 |
| `plugin.description` | 否 | 展示用 |
| `plugin.capabilities` | 是 | 所需宿主能力，见第 5 节 |
| `plugin.css` | 否 | 注入 iframe 内的样式（宿主自动加 nonce） |
| `plugin.csp` | 否 | 追加到 iframe CSP 的自定义指令（如需要网络访问） |
| `source` | 是 | 插件入口代码字符串，在 iframe 内执行 |

> 切勿在 `source` 中访问父页面（如 `window.parent.document`），沙箱源隔离会让这类访问失败或受限。

## 3. 运行环境全局对象

插件代码在 iframe 内可访问以下全局对象：

- `window.__PluginRuntime` —— 高层 API（兼容 `CanvasPluginApp`）
- `window.hostBridge` —— 宿主能力桥（canvas / ai / storage）
- `window.__pluginRpc` —— 底层 RPC（`call` / `on` / `emit` / `register`）

### 3.1 基础 API（`window.__PluginRuntime`）

| 方法 | 说明 |
|------|------|
| `version: string` | 运行时版本 |
| `emit(event, payload?)` | 向宿主发送事件 |
| `on(event, handler)` | 监听宿主事件，返回取消订阅函数 |
| `injectCSS(css, key?)` | 注入样式，返回清理函数 |
| `renderPanel(view)` | 推送声明式面板（需 `ui:render`） |
| `clearPanel()` | 清除面板 |
| `register(method, handler)` | 注册「宿主 → 插件」的 RPC 处理方法（如面板按钮回调 `onPanelAction`） |

### 3.2 宿主能力桥（`window.hostBridge`）

| 分组 | 方法 |
|------|------|
| `canvas` | `getNode(id)`、`getNodes()`、`getConnections()`、`getUpstream(nodeId)`、`getDownstream(nodeId)`、`updateNode(nodeId, patch)`、`updateMetadata(nodeId, patch)`、`applyOps(ops)` |
| `ai` | `generateImage(prompt, options?)`、`generateVideo(prompt, options?)`、`generateText(prompt, options?)`、`listModels(capability?)`、`defaultModel(capability)` |
| `storage` | `get(key)`、`set(key, value)`、`remove(key)`（插件私有存储，按命名空间隔离） |
| 其它 | `addEventListener(event, handler)`、`removeEventListener(event, handler)`、`call(method, payload)`（底层 RPC） |

> 注意：桥方法映射到具体能力。`applyOps` 对应 `canvas:write`，`ai.*` 对应 `ai:generate`。插件调用 **未声明** 的能力时，宿主拒绝并返回 `Permission denied`。

## 4. 声明式面板（SandboxPanelView）

`ui:render` 能力下，插件用 `renderPanel` 推送一个可序列化对象，由宿主渲染 UI：

```ts
type SandboxPanelAction = { id: string; label: string; kind?: "primary" | "default" | "danger" };
type SandboxPanelView = {
  title?: string;
  description?: string;
  image?: string;                       // data URL 或 http(s) 图片地址
  status?: "idle" | "loading" | "done" | "error";
  actions?: SandboxPanelAction[];
};
```

面板按钮点击会触发 `onPanelAction` 事件，payload 为 `{ actionId }`：

```js
rpc.register('onPanelAction', function (p) {
  if (p && p.actionId === 'regenerate') return run();
});
```

## 5. 能力（capabilities）

插件需在 `plugin.capabilities` 中声明所需能力。宿主按风险等级决定是否默认授权、是否弹窗：

| 能力 | 风险 | 默认授权 |
|------|------|----------|
| `storage:read` / `storage:write` | low | 是 |
| `canvas:read` | low | 是 |
| `ui:render` | low | 是 |
| `clipboard:write` | low | 是 |
| `canvas:write` | medium | 否 |
| `clipboard:read` | medium | 否 |
| `ai:generate` | high | 否 |
| `network:fetch` | high | 否 |
| `dom:access` | high | 否 |
| `notifications` | low | 否 |

未默认授权的能力，宿主在插件的 `call` 命中时弹窗请求用户确认（对话框前缀 **`插件请求权限：`**）。授权结果持久化在 `localStorage` 键 `nova-canvas:plugin_permissions`。

若插件需要发起网络请求，除声明 `network:fetch` 外，还应在 `plugin.csp` 中追加对应 `connect-src` 指令，宿主会将其合并进 iframe CSP。

## 6. 安全模型要点

- 沙箱 iframe 以不透明源运行，不可读取父页面；父子通信一律 postMessage。
- 插件源码仅注入 iframe 内执行，绝不进入主上下文 `eval`。
- 宿主校验消息来源（`event.source === iframe.contentWindow`），只处理自身 iframe 的消息。
- iframe 就绪后向宿主发送 `iframe:ready` 事件，宿主据此标记为 ready。

## 7. 完整示例

见 `web/public/plugins/sandbox-sample.json`（节选）：

```json
{
  "plugin": {
    "id": "sandbox-sample",
    "name": "Sandbox Sample",
    "version": "0.1.0",
    "description": "示例沙箱插件：演示宿主能力调用、事件回传与声明式面板渲染。",
    "capabilities": ["canvas:read", "ai:generate", "ui:render"],
    "css": ".sandbox-sample-tip{color:#22c55e}"
  },
  "source": "(function(){var rpc=window.__PluginRuntime;function render(res){var url=(typeof res==='string')?res:((res&&res.images&&res.images[0])||'');rpc.renderPanel({title:'示例沙箱插件',description:'已读取画布节点/连线，并调用 AI 生成图片',image:url,status:'done',actions:[{id:'regenerate',label:'再生成'}]});}function fail(e){rpc.renderPanel({title:'示例沙箱插件',description:'出错了：'+((e&&e.message)||e),status:'error'});}function run(){rpc.renderPanel({title:'示例沙箱插件',description:'正在生成…',status:'loading'});rpc.call('getNodes').then(function(){return rpc.call('getConnections');}).then(function(){return rpc.call('ai.generateImage',{prompt:'a small red circle on a white background'});}).then(render).catch(fail);}rpc.register('onPanelAction',function(p){if(p&&p.actionId==='regenerate'){return run();}});run();})();"
}
```

## 8. 如何加载插件

1. **插件管理器安装**：打开插件管理器 → 「第三方」标签页 → 打开 **Sandbox (iframe)** 开关 → 在 URL 输入框填入 JSON 地址（如 `/plugins/sandbox-sample.json`）→ 点击「安装」。
2. **本地插件发现**：将信封文件放入 `web/public/plugins/`，宿主启动时以「本地插件」发现（默认禁用，启用时按 URL 重新拉取源码）。

## 9. 事件回传

插件可 `rpc.emit('myEvent', payload)` 向宿主发送事件；宿主侧通过 loader 的事件订阅（`subscribeAllPluginEvents` / `onMessage`）接收，典型用于面板状态与进度更新。

## 10. 调试

- 浏览器控制台关注 `[Plugin] Load error` 与 `[sandbox]` 日志。
- 权限持久化键：`nova-canvas:plugin_permissions`（localStorage），可手动清除以重新触发授权弹窗。
- 端到端冒烟测试见 `web/e2e/sandbox-plugin.spec.ts`（Playwright，真实浏览器跑通安装/权限弹窗/事件回传/声明式面板）。
