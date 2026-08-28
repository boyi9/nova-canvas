import { createIframeSandbox, createPluginIframeHTML } from './iframe-sandbox-host';
import {
    buildCSP,
    isCapabilityGranted,
    requestCapability,
    type PluginManifest,
} from './iframe-sandbox';
import { registerNodeDefinitions, unregisterPluginNodes } from './node-registry';
import { usePluginStore, type InstalledPlugin } from '@/stores/canvas/use-plugin-store';
import { useSandboxPanelStore } from '@/stores/canvas/use-sandbox-panel-store';
import type { CanvasPlugin, CanvasPluginApp, SandboxPanelView } from '@/types/canvas-plugin';

// 注意：不要在此模块导入 @/lib/canvas/plugin-loader，以免形成循环依赖。
// 沙箱插件的重载/启停在 plugin-loader 中通过本模块导出的 activateIframePlugin/deactivateIframePlugin 完成。

interface IframePluginInstance {
    id: string;
    iframe: HTMLIFrameElement;
    sandbox: ReturnType<typeof createIframeSandbox>;
    manifest: PluginManifest;
    plugin: CanvasPlugin;
    disposers: Array<() => void>;
}

const instances = new Map<string, IframePluginInstance>();
const capabilityCache = new Map<string, Map<string, boolean>>();

/**
 * 宿主桥接：由画布页面注册，将沙箱内插件的 canvas/ai 能力请求路由到真实实现。
 * 未注册时，相关能力请求会抛出明确错误而非静默失败。
 */
export interface IframeHostBridge {
    getNode: (id: string) => Promise<unknown>;
    getNodes: () => Promise<unknown[]>;
    getConnections: () => Promise<unknown[]>;
    getUpstream: (nodeId: string) => Promise<unknown[]>;
    getDownstream: (nodeId: string) => Promise<unknown[]>;
    updateNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
    updateMetadata: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
    applyOps: (ops: unknown[]) => Promise<void>;
    ai: {
        generateImage: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        generateVideo: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        generateText: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        listModels: (capability?: string) => Promise<unknown[]>;
        defaultModel: (capability: string) => Promise<string>;
    };
}

let hostBridge: IframeHostBridge | null = null;
export function setIframeHostBridge(bridge: IframeHostBridge | null): void {
    hostBridge = bridge;
}

function storageKey(pluginId: string, key: string): string {
    return `nova-canvas:plugin:${pluginId}:${key}`;
}

function injectCSSMain(css: string, key: string): () => void {
    const id = `canvas-plugin-style-${key}`;
    document.getElementById(id)?.remove();
    const style = document.createElement('style');
    style.id = id;
    style.dataset.canvasPluginStyle = 'true';
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
}

// 将宿主 RPC 方法映射到所需能力；未列出的方法不要求额外能力。
function methodCapability(method: string): string | null {
    if (method === 'pluginStorage.get') return 'storage:read';
    if (method === 'pluginStorage.set' || method === 'pluginStorage.remove') return 'storage:write';
    if (['getNode', 'getNodes', 'getConnections', 'getUpstream', 'getDownstream'].includes(method)) return 'canvas:read';
    if (['updateNode', 'updateMetadata', 'applyOps'].includes(method)) return 'canvas:write';
    if (method.startsWith('ai.')) return 'ai:generate';
    if (method === 'renderPanel' || method === 'clearPanel') return 'ui:render';
    return null;
}

/**
 * 检查插件是否被授权使用某能力。默认授予的能力直接通过；高风险能力在首次使用时向用户申请。
 * 插件必须在 manifest.capabilities 中声明该能力，否则一律拒绝（最小权限）。
 */
async function checkCapability(pluginId: string, capability: string): Promise<boolean> {
    const instance = instances.get(pluginId);
    if (!instance || !instance.manifest.capabilities.includes(capability)) return false;
    const cache = capabilityCache.get(pluginId) ?? new Map<string, boolean>();
    if (cache.has(capability)) return cache.get(capability)!;
    let granted = isCapabilityGranted(pluginId, capability);
    if (!granted) granted = await requestCapability(pluginId, capability);
    // 只缓存已授权结果；拒绝不缓存，允许用户后续重新授权。
    if (granted) {
        cache.set(capability, true);
        capabilityCache.set(pluginId, cache);
    }
    return granted;
}

async function handlePluginRequest(pluginId: string, method: string, payload: unknown): Promise<unknown> {
    const capability = methodCapability(method);
    if (capability) {
        const ok = await checkCapability(pluginId, capability);
        if (!ok) throw new Error(`Permission denied: ${capability} (${method})`);
    }

    // 插件私有存储：与主上下文隔离，使用 localStorage 命名空间
    switch (method) {
        case 'pluginStorage.get': {
            const key = (payload as { key: string }).key;
            const raw = localStorage.getItem(storageKey(pluginId, key));
            return raw ? JSON.parse(raw) : null;
        }
        case 'pluginStorage.set': {
            const { key, value } = payload as { key: string; value: unknown };
            localStorage.setItem(storageKey(pluginId, key), JSON.stringify(value));
            return null;
        }
        case 'pluginStorage.remove': {
            const key = (payload as { key: string }).key;
            localStorage.removeItem(storageKey(pluginId, key));
            return null;
        }
        // 沙箱插件推送/清除声明式面板（宿主 UI 渲染，不需要 hostBridge）。
        case 'renderPanel': {
            useSandboxPanelStore.getState().setPanel(pluginId, (payload as SandboxPanelView) ?? {});
            return null;
        }
        case 'clearPanel': {
            useSandboxPanelStore.getState().clearPanel(pluginId);
            return null;
        }
        default:
            break;
    }

    if (!hostBridge) throw new Error(`Host capability not available: ${method}`);
    switch (method) {
        case 'getNode':
            return hostBridge.getNode((payload as { id: string }).id);
        case 'getNodes':
            return hostBridge.getNodes();
        case 'getConnections':
            return hostBridge.getConnections();
        case 'getUpstream':
            return hostBridge.getUpstream((payload as { nodeId: string }).nodeId);
        case 'getDownstream':
            return hostBridge.getDownstream((payload as { nodeId: string }).nodeId);
        case 'updateNode': {
            const p = payload as { nodeId: string; patch: Record<string, unknown> };
            return hostBridge.updateNode(p.nodeId, p.patch);
        }
        case 'updateMetadata': {
            const p = payload as { nodeId: string; patch: Record<string, unknown> };
            return hostBridge.updateMetadata(p.nodeId, p.patch);
        }
        case 'applyOps':
            return hostBridge.applyOps((payload as { ops: unknown[] }).ops);
        case 'ai.generateImage': {
            const p = payload as { prompt: string; options?: Record<string, unknown> };
            return hostBridge.ai.generateImage(p.prompt, p.options);
        }
        case 'ai.generateVideo': {
            const p = payload as { prompt: string; options?: Record<string, unknown> };
            return hostBridge.ai.generateVideo(p.prompt, p.options);
        }
        case 'ai.generateText': {
            const p = payload as { prompt: string; options?: Record<string, unknown> };
            return hostBridge.ai.generateText(p.prompt, p.options);
        }
        case 'ai.listModels':
            return hostBridge.ai.listModels((payload as { capability?: string }).capability);
        case 'ai.defaultModel':
            return hostBridge.ai.defaultModel((payload as { capability: string }).capability);
        default:
            throw new Error(`Method not found: ${method}`);
    }
}

/**
 * 激活一个 iframe 沙箱插件：创建隔离 iframe、注册节点定义、注入样式并触发 setup。
 * 返回实例；插件源码在 iframe 内通过 window.__PluginRuntime 与宿主通信。
 */
export function activateIframePlugin(plugin: CanvasPlugin, source: string, css?: string): IframePluginInstance {
    const manifest: PluginManifest = {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        capabilities: plugin.capabilities ?? [],
        csp: plugin.csp,
    };

    const nonce = Math.random().toString(36).slice(2);
    const csp = buildCSP(manifest).replace(
        /script-src[^;]*/,
        `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    );
    const html = createPluginIframeHTML({ ...manifest, source, css }, nonce);
    const sandbox = createIframeSandbox({
        config: {
            pluginId: plugin.id,
            manifest: {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                capabilities: manifest.capabilities,
                csp: manifest.csp,
            },
            csp,
            srcDoc: html,
        },
        onRequest: (msg) => handlePluginRequest(plugin.id, msg.method, msg.payload),
        onMessage: (method, payload) => forwardPluginEvent(plugin.id, method, payload),
        onReady: () => {
            forwardPluginEvent(plugin.id, 'iframe:ready');
            // 告知沙箱插件画布已就绪，触发依赖 canvas:ready 的插件逻辑。
            sandbox.emit('canvas:ready');
        },
    });

    const disposers: Array<() => void> = [];
    if (css) disposers.push(injectCSSMain(css, plugin.id));

    const app: CanvasPluginApp = {
        version: '1.0.0',
        emit: (event, payload) => sandbox.emit(event, payload),
        on: (event, handler) => sandbox.on(event, handler),
        injectCSS: (style, key) => injectCSSMain(style, key ?? plugin.id),
    };
    const cleanup = plugin.setup?.(app);
    if (typeof cleanup === 'function') disposers.push(cleanup);

    registerNodeDefinitions(plugin.nodes ?? [], plugin.id);

    const instance: IframePluginInstance = { id: plugin.id, iframe: sandbox.iframe, sandbox, manifest, plugin, disposers };
    instances.set(plugin.id, instance);
    return instance;
}

export function deactivateIframePlugin(pluginId: string): void {
    const instance = instances.get(pluginId);
    if (!instance) return;
    instance.disposers.forEach((dispose) => dispose());
    instance.sandbox.destroy();
    instances.delete(pluginId);
    capabilityCache.delete(pluginId);
    unregisterPluginNodes(pluginId);
    useSandboxPanelStore.getState().clearPanel(pluginId);
}

export function getIframePlugin(pluginId: string): IframePluginInstance | undefined {
    return instances.get(pluginId);
}

export function isIframePluginLoaded(pluginId: string): boolean {
    return instances.has(pluginId);
}

// 沙箱插件 -> 宿主 事件回传：插件通过 app.emit / window.__pluginRpc.emit 主动上报事件，
// 宿主在此统一转发给订阅者（如插件管理器的实时事件面板）。
export interface PluginEvent {
    type: string;
    payload?: unknown;
}

type PluginEventHandler = (event: PluginEvent) => void;
const pluginEventSubs = new Map<string, Set<PluginEventHandler>>();
const pluginEventAllSubs = new Set<(pluginId: string, event: PluginEvent) => void>();

export function subscribePluginEvents(pluginId: string, handler: PluginEventHandler): () => void {
    const subs = pluginEventSubs.get(pluginId) ?? new Set<PluginEventHandler>();
    subs.add(handler);
    pluginEventSubs.set(pluginId, subs);
    return () => {
        const s = pluginEventSubs.get(pluginId);
        if (s) {
            s.delete(handler);
            if (s.size === 0) pluginEventSubs.delete(pluginId);
        }
    };
}

export function subscribeAllPluginEvents(handler: (pluginId: string, event: PluginEvent) => void): () => void {
    pluginEventAllSubs.add(handler);
    return () => {
        pluginEventAllSubs.delete(handler);
    };
}

function forwardPluginEvent(pluginId: string, type: string, payload?: unknown): void {
    const event: PluginEvent = { type, payload };
    pluginEventSubs.get(pluginId)?.forEach((h) => {
        try {
            h(event);
        } catch (e) {
            console.error('[sandbox] plugin event subscriber error', e);
        }
    });
    pluginEventAllSubs.forEach((h) => {
        try {
            h(pluginId, event);
        } catch (e) {
            console.error('[sandbox] plugin event subscriber error', e);
        }
    });
}

/**
 * 从 URL 安装 iframe 插件（source 运行于沙箱）。plugin 描述符由调用方提供，
 * 便于与插件市场/本地清单集成；安装后写入插件仓库并立即激活。
 */
export async function installIframePlugin(
    plugin: CanvasPlugin,
    source: string,
    opts?: { official?: boolean; url?: string },
): Promise<IframePluginInstance> {
    deactivateIframePlugin(plugin.id); // 替换上一版本
    usePluginStore.getState().upsert({
        id: plugin.id,
        name: plugin.name || plugin.id,
        version: plugin.version || '0.0.0',
        description: plugin.description,
        url: opts?.url ?? '',
        source,
        enabled: true,
        official: opts?.official,
        sandbox: true,
        manifest: plugin,
    });
    return activateIframePlugin(plugin, source, plugin.css);
}

export async function loadIframePluginFromUrl(
    url: string,
    opts?: { official?: boolean; bustCache?: boolean },
): Promise<IframePluginInstance> {
    const separator = url.includes("?") ? "&" : "?";
    const target = opts?.bustCache ? `${url}${separator}t=${Date.now()}` : url;
    const response = await fetch(target);
    if (!response.ok) throw new Error(`Plugin download failed: ${response.status}`);
    const text = await response.text();
    // Sandboxed plugins ship a JSON envelope: a trusted-shaped manifest plus untrusted source.
    // The source runs inside the iframe sandbox; node definitions come from the manifest.
    let manifest: CanvasPlugin;
    let source: string;
    try {
        const env = JSON.parse(text) as { plugin: CanvasPlugin; source: string };
        manifest = env.plugin;
        source = env.source;
    } catch {
        throw new Error("Sandboxed plugin URL must return a JSON envelope: {\"plugin\": {...}, \"source\": \"...\"}");
    }
    if (!manifest?.id) throw new Error("Envelope missing plugin.id");
    return installIframePlugin(manifest, source, { official: opts?.official, url });
}

export function uninstallIframePlugin(id: string): void {
    deactivateIframePlugin(id);
    usePluginStore.getState().remove(id);
}

/**
 * 运行一段「生图脚本」：用户提供的 JS 源码在沙箱 iframe 内执行（不进主上下文），
 * 通过 hostBridge 调用宿主 AI / 画布能力，结果可经 applyOps 回写画布。
 * 与完整插件不同，脚本不需要 nodes / setup，仅需声明所需能力。
 */
export interface IframeScriptSpec {
    id: string;
    name: string;
    source: string;
    version?: string;
    description?: string;
    capabilities?: string[];
    url?: string;
    css?: string;
}

const DEFAULT_SCRIPT_CAPABILITIES = ["canvas:read", "canvas:write", "ai:generate", "ui:render"];

export async function runIframeScript(spec: IframeScriptSpec): Promise<IframePluginInstance> {
    if (!spec.source?.trim()) throw new Error("Script source is empty");
    const plugin: CanvasPlugin = {
        id: spec.id,
        name: spec.name || spec.id,
        version: spec.version || "0.0.0",
        description: spec.description,
        capabilities: spec.capabilities && spec.capabilities.length > 0 ? spec.capabilities : DEFAULT_SCRIPT_CAPABILITIES,
        css: spec.css,
        nodes: [],
    };
    return installIframePlugin(plugin, spec.source, { url: spec.url });
}

/**
 * 从 URL 加载原始 JS 文本并作为脚本运行（与插件信封不同，这里直接是源码）。
 */
export async function runIframeScriptFromUrl(url: string, opts?: { name?: string; capabilities?: string[] }): Promise<IframePluginInstance> {
    const target = url.trim();
    if (!target) throw new Error("Script URL is empty");
    const response = await fetch(target);
    if (!response.ok) throw new Error(`Script download failed: ${response.status}`);
    const source = await response.text();
    const name = opts?.name || target.split("/").pop()?.replace(/\.js$/, "") || "script";
    const id = `script:${name}`;
    return runIframeScript({ id, name, source, capabilities: opts?.capabilities, url: target });
}

export type { InstalledPlugin };
