import {
    buildCSP,
    IFRAME_SANDBOX_ATTR,
    type PluginManifest,
} from './iframe-sandbox';

// iframe 内部运行的插件运行时代码：建立与宿主的 postMessage 通道，并暴露 PluginRuntimeAPI。
const PLUGIN_RUNTIME_SOURCE = `
(function() {
    'use strict';

    let messageId = 0;
    const pending = new Map();
    const handlers = new Map();
    const eventHandlers = new Map();

    function send(type, payload, id) {
        window.parent.postMessage({ type, payload, id }, '*');
    }

    function dispatch(msg) {
        if (msg.type === 'response' || msg.type === 'error') {
            const resolver = pending.get(msg.id);
            if (resolver) {
                pending.delete(msg.id);
                if (msg.type === 'error') resolver.reject(new Error(msg.error));
                else resolver.resolve(msg.payload);
            }
        } else if (msg.type === 'event') {
            const handlers_ = eventHandlers.get(msg.method) || [];
            handlers_.forEach(h => h(msg.payload));
        } else if (msg.type === 'request') {
            const handler = handlers.get(msg.method);
            if (handler) {
                Promise.resolve().then(() => handler(msg.payload)).then(
                    result => send('response', result, msg.id),
                    error => send('error', error.message, msg.id)
                );
            } else {
                send('error', 'Method not found: ' + msg.method, msg.id);
            }
        }
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window.parent) return;
        dispatch(e.data);
    });

        // RPC 调用
        window.__pluginRpc = {
            call: (method, payload) => new Promise((resolve, reject) => {
                const id = ++messageId + '-' + Math.random().toString(36).slice(2);
                pending.set(id, { resolve, reject });
                window.parent.postMessage({ type: 'request', id, method, payload }, '*');
            }),
        on: (event, handler) => {
            const handlers_ = eventHandlers.get(event) || [];
            handlers_.push(handler);
            eventHandlers.set(event, handlers_);
            return () => {
                const h = eventHandlers.get(event) || [];
                eventHandlers.set(event, h.filter(x => x !== handler));
            };
        },
        emit: (event, payload) => send('event', { event, payload }, null),
        register: (method, handler) => {
            handlers.set(method, handler);
        }
    };

    // 基础运行时 API（CanvasPluginApp 兼容）
    const runtime = {
        version: '1.0.0',
        emit: (event, payload) => send('event', { event, payload }, null),
        on: (event, handler) => {
            const h = eventHandlers.get(event) || [];
            h.push(handler);
            eventHandlers.set(event, h);
            return () => {
                const hs = eventHandlers.get(event) || [];
                eventHandlers.set(event, hs.filter(x => x !== handler));
            };
        },
        injectCSS: (css, key) => {
            const id = key ? 'plugin-style-' + key : undefined;
            if (id) document.getElementById(id)?.remove();
            const style = document.createElement('style');
            if (id) style.id = id;
            style.dataset.canvasPluginStyle = 'true';
            style.textContent = css;
            document.head.appendChild(style);
            return () => style.remove();
        },
        // 沙箱插件向宿主 UI 推送声明式面板，宿主负责实际渲染。
        renderPanel: (view) => window.__pluginRpc.call('renderPanel', view),
        clearPanel: () => window.__pluginRpc.call('clearPanel', {}),
        register: (method, handler) => window.__pluginRpc.register(method, handler),
        // 宿主能力桥：插件通过 hostBridge 调用 canvas/ai/storage，均由宿主侧鉴权后执行。
        hostBridge: {
            canvas: {
                getNode: (id) => window.__pluginRpc.call('getNode', { id }),
                getNodes: () => window.__pluginRpc.call('getNodes', {}),
                getConnections: () => window.__pluginRpc.call('getConnections', {}),
                getUpstream: (nodeId) => window.__pluginRpc.call('getUpstream', { nodeId }),
                getDownstream: (nodeId) => window.__pluginRpc.call('getDownstream', { nodeId }),
                updateNode: (nodeId, patch) => window.__pluginRpc.call('updateNode', { nodeId, patch }),
                updateMetadata: (nodeId, patch) => window.__pluginRpc.call('updateMetadata', { nodeId, patch }),
                applyResult: (result) => window.__pluginRpc.call('applyOps', { ops: Array.isArray(result) ? result : [result] }),
                applyOps: (ops) => window.__pluginRpc.call('applyOps', { ops }),
            },
            ai: {
                generateImage: (prompt, options) => window.__pluginRpc.call('ai.generateImage', { prompt, options }),
                generateVideo: (prompt, options) => window.__pluginRpc.call('ai.generateVideo', { prompt, options }),
                generateText: (prompt, options) => window.__pluginRpc.call('ai.generateText', { prompt, options }),
                listModels: (capability) => window.__pluginRpc.call('ai.listModels', { capability }),
                defaultModel: (capability) => window.__pluginRpc.call('ai.defaultModel', { capability }),
            },
            storage: {
                get: (key) => window.__pluginRpc.call('pluginStorage.get', { key }),
                set: (key, value) => window.__pluginRpc.call('pluginStorage.set', { key, value }),
                remove: (key) => window.__pluginRpc.call('pluginStorage.remove', { key }),
            },
            addEventListener: (event, handler) => window.__pluginRpc.on(event, handler),
            removeEventListener: (event, handler) => {
                const off = listenerDisposers.get(handler);
                if (off) {
                    off();
                    listenerDisposers.delete(handler);
                }
            },
            call: (method, payload) => window.__pluginRpc.call(method, payload),
        },
    };

    const listenerDisposers = new Map();

    // 暴露给插件的全局对象
    window.__PluginRuntime = runtime;
    window.__PluginRuntime.call = window.__pluginRpc.call;
    window.__PluginRuntime.on = window.__pluginRpc.on;
    window.__PluginRuntime.emit = window.__pluginRpc.emit;
    window.__PluginRuntime.renderPanel = runtime.renderPanel;
    window.__PluginRuntime.clearPanel = runtime.clearPanel;
    window.__PluginRuntime.register = runtime.register;
    window.__PluginRuntime.hostBridge = runtime.hostBridge;
    window.hostBridge = runtime.hostBridge;

    // 通知宿主 iframe 就绪
    send('event', { event: 'iframe:ready' }, null);
})();
`;

interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
}

export interface IframeSandboxOptions {
    config: {
        pluginId: string;
        manifest: { id: string; name: string; version: string; capabilities: string[]; csp?: string };
        csp: string;
        srcDoc: string;
    };
    // 宿主调用插件方法
    onMessage?: (method: string, payload: unknown) => void;
    // 插件请求宿主能力（canvas/ai/storage 等），由调用方桥接到真实实现
    onRequest?: (msg: { id: string; method: string; payload?: unknown }) => Promise<unknown> | unknown;
    onReady?: () => void;
    onError?: (error: Error) => void;
}

export function createIframeSandbox(options: IframeSandboxOptions): {
    iframe: HTMLIFrameElement;
    call: <T>(method: string, payload?: unknown) => Promise<T>;
    on: (event: string, handler: (payload: unknown) => void) => () => void;
    emit: (event: string, payload?: unknown) => void;
    destroy: () => void;
    isReady: () => boolean;
} {
    const { config, onMessage, onReady, onError, onRequest } = options;
    const pendingRequests = new Map<string, PendingRequest>();
    const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
    let ready = false;
    let messageId = 0;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = IFRAME_SANDBOX_ATTR;
    iframe.setAttribute('csp', config.csp);
    iframe.srcdoc = config.srcDoc;

    function sendMessage<T>(method: string, payload?: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const msg = { type: 'request', id, method, payload };
            pendingRequests.set(id, { resolve, reject });
            iframe.contentWindow?.postMessage(msg, '*');
            // 超时保护，避免插件无响应时 Promise 永久挂起
            setTimeout(() => {
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject(new Error(`RPC timeout: ${method}`));
                }
            }, 30000);
        });
    }

    function handleMessage(e: MessageEvent) {
        if (e.source !== iframe.contentWindow) return;
        const msg = e.data as { type: string; id?: string; method?: string; payload?: unknown; error?: string };
        if (!msg || !msg.type) return;

        if (msg.type === 'response') {
            const pending = pendingRequests.get(msg.id!);
            if (pending) {
                pendingRequests.delete(msg.id!);
                pending.resolve(msg.payload);
            }
        } else if (msg.type === 'error') {
            const pending = pendingRequests.get(msg.id!);
            if (pending) {
                pendingRequests.delete(msg.id!);
                pending.reject(new Error(msg.error || 'Unknown error'));
            }
        } else if (msg.type === 'event') {
            const data = (msg.payload ?? {}) as { event?: string; payload?: unknown };
            const eventName = data.event;
            const eventPayload = data.payload;
            if (eventName === 'iframe:ready') {
                ready = true;
                onReady?.();
            } else if (eventName && onMessage) {
                onMessage(eventName, eventPayload);
            }
            const handlers = eventHandlers.get(eventName);
            if (handlers) handlers.forEach((h) => h(eventPayload));
        } else if (msg.type === 'request') {
            // 插件请求宿主能力，交由调用方桥接
            void handlePluginRequest({ id: msg.id!, method: msg.method!, payload: msg.payload });
        }
    }

    async function handlePluginRequest(msg: { id: string; method: string; payload?: unknown }) {
        try {
            if (!onRequest) {
                iframe.contentWindow?.postMessage({ type: 'response', id: msg.id, payload: null }, '*');
                return;
            }
            const payload = await onRequest(msg);
            iframe.contentWindow?.postMessage({ type: 'response', id: msg.id, payload }, '*');
        } catch (error) {
            iframe.contentWindow?.postMessage(
                { type: 'error', id: msg.id, error: error instanceof Error ? error.message : String(error) },
                '*',
            );
        }
    }

    window.addEventListener('message', handleMessage);

    const sandbox = {
        iframe,
        call: <T,>(method: string, payload?: unknown): Promise<T> => sendMessage<T>(method, payload),
        on: (event: string, handler: (payload: unknown) => void) => {
            const handlers = eventHandlers.get(event) || new Set<(payload: unknown) => void>();
            handlers.add(handler);
            eventHandlers.set(event, handlers);
            return () => {
                const hs = eventHandlers.get(event);
                if (hs) hs.delete(handler);
            };
        },
        emit: (event: string, payload?: unknown) => {
            iframe.contentWindow?.postMessage({ type: 'event', method: event, payload }, '*');
        },
        destroy: () => {
            window.removeEventListener('message', handleMessage);
            iframe.remove();
        },
        isReady: () => ready,
    };

    document.body.appendChild(iframe);

    return sandbox;
}

/**
 * 创建插件 iframe 的 HTML 文档（含运行时 + 插件源码注入点）。
 * manifest 需携带 capabilities（用于 CSP 动态放宽）与 source（插件代码）。
 */
export function createPluginIframeHTML(
    manifest: PluginManifest & { source: string; css?: string },
    nonce?: string,
): string {
    const usedNonce = nonce ?? Math.random().toString(36).slice(2);
    // 将 nonce 注入现有 script-src（避免重复 script-src 指令被浏览器忽略）。
    const csp = buildCSP(manifest).replace(
        /script-src[^;]*/,
        `script-src 'nonce-${usedNonce}' 'wasm-unsafe-eval'`,
    );

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${manifest.name} (sandboxed)</title>
    <style nonce="${usedNonce}">
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        #plugin-root { width: 100%; height: 100%; }
    </style>
    ${manifest.css ? `<style nonce="${usedNonce}">${manifest.css}</style>` : ''}
</head>
<body>
    <div id="plugin-root"></div>
    <script nonce="${usedNonce}">
        ${PLUGIN_RUNTIME_SOURCE}
    </script>
    <script nonce="${usedNonce}">
        // 插件源码注入点：插件作者使用 window.__PluginRuntime / window.__pluginRpc
        try {
            ${manifest.source}
        } catch (e) {
            console.error('[Plugin] Load error:', e);
            window.parent.postMessage({ type: 'error', error: 'Plugin load failed: ' + (e && e.message) }, '*');
        }
    </script>
</body>
</html>`;
}
