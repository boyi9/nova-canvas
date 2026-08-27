import { createIframeSandbox, createPluginIframeHTML } from './iframe-sandbox-host';
import {
    buildCSP,
    isCapabilityGranted,
    requestCapability,
    type PluginManifest,
} from './iframe-sandbox';
import { registerNodeDefinitions, unregisterPluginNodes } from './node-registry';
import { usePluginStore, type InstalledPlugin } from '@/stores/canvas/use-plugin-store';
import type { CanvasPlugin, CanvasPluginApp } from '@/types/canvas-plugin';

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

    const html = createPluginIframeHTML({ ...manifest, source, css });
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
            csp: buildCSP(manifest),
            srcDoc: html,
        },
        onRequest: (msg) => handlePluginRequest(plugin.id, msg.method, msg.payload),
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
}

export function getIframePlugin(pluginId: string): IframePluginInstance | undefined {
    return instances.get(pluginId);
}

export function isIframePluginLoaded(pluginId: string): boolean {
    return instances.has(pluginId);
}

function withCacheBust(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
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

export type { InstalledPlugin };
