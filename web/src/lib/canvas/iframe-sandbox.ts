/**
 * iframe 沙箱通信协议
 *
 * 所有 host <-> plugin 通信使用 postMessage，消息格式：
 * { type: 'request' | 'response' | 'event' | 'error', id?: string, method?: string, payload?: unknown, error?: string }
 */

export type SandboxMessageType = 'request' | 'response' | 'event' | 'error';

export interface SandboxMessage<T = unknown> {
    type: SandboxMessageType;
    id?: string;
    method?: string;
    payload?: T;
    error?: string;
}

export interface PluginCapability {
    name: string;
    description: string;
    risk?: 'low' | 'medium' | 'high';
    defaultGranted?: boolean;
}

export const PLUGIN_CAPABILITIES: PluginCapability[] = [
    { name: 'storage:read', description: '读取插件私有存储', risk: 'low', defaultGranted: true },
    { name: 'storage:write', description: '写入插件私有存储', risk: 'low', defaultGranted: true },
    { name: 'canvas:read', description: '读取画布节点/连线信息', risk: 'low', defaultGranted: true },
    { name: 'canvas:write', description: '修改画布节点/连线', risk: 'medium', defaultGranted: false },
    { name: 'ai:generate', description: '调用 AI 生成（图/视频/文本）', risk: 'high', defaultGranted: false },
    { name: 'network:fetch', description: '发起网络请求', risk: 'high', defaultGranted: false },
    { name: 'dom:access', description: '访问宿主 DOM', risk: 'high', defaultGranted: false },
    { name: 'clipboard:read', description: '读取剪贴板', risk: 'medium', defaultGranted: false },
    { name: 'clipboard:write', description: '写入剪贴板', risk: 'low', defaultGranted: true },
    { name: 'notifications', description: '发送桌面通知', risk: 'low', defaultGranted: false },
];

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    capabilities: string[];
    minAppVersion?: string;
    csp?: string; // Custom CSP for the plugin iframe
}

export interface PluginPermissionState {
    pluginId: string;
    granted: Record<string, boolean>;
    requestedAt: Record<string, number>;
    decidedAt: Record<string, number>;
}

const STORAGE_KEY = 'nova-canvas:plugin_permissions';

export function getPluginPermissions(pluginId: string): PluginPermissionState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { pluginId, granted: {}, requestedAt: {}, decidedAt: {} };
        const all = JSON.parse(raw);
        return all[pluginId] || { pluginId, granted: {}, requestedAt: {}, decidedAt: {} };
    } catch {
        return { pluginId, granted: {}, requestedAt: {}, decidedAt: {} };
    }
}

export function setPluginPermission(pluginId: string, capability: string, granted: boolean): void {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const all = raw ? JSON.parse(raw) : {};
        if (!all[pluginId]) all[pluginId] = { pluginId, granted: {}, requestedAt: {}, decidedAt: {} };
        const state = all[pluginId];
        state.granted[capability] = granted;
        state.decidedAt[capability] = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
        console.warn('[sandbox] Failed to persist permission', e);
    }
}

export function isCapabilityGranted(pluginId: string, capability: string): boolean {
    const state = getPluginPermissions(pluginId);
    const cap = PLUGIN_CAPABILITIES.find(c => c.name === capability);
    const defaultGranted = cap?.defaultGranted ?? false;
    return state.granted[capability] ?? defaultGranted;
}

export function requestCapability(pluginId: string, capability: string): Promise<boolean> {
    const state = getPluginPermissions(pluginId);
    if (capability in state.granted) {
        return Promise.resolve(state.granted[capability]);
    }
    state.requestedAt[capability] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), [pluginId]: state }));

    return new Promise((resolve) => {
        const cap = PLUGIN_CAPABILITIES.find(c => c.name === capability);
        const message = `插件请求权限：${cap?.description || capability}`;
        const granted = window.confirm(`${message}\n\n是否允许？`);
        setPluginPermission(pluginId, capability, granted);
        resolve(granted);
    });
}

/**
 * 生成 iframe CSP 策略
 */
export function buildCSP(manifest?: PluginManifest): string {
    const base = [
        "default-src 'none'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ];

    if (manifest?.csp) {
        base.push(manifest.csp);
    }

    // 根据申请的 capabilities 动态放宽
    const caps = manifest?.capabilities || [];
    if (caps.includes('network:fetch')) {
        // 允许网络请求到特定域名（需在 manifest 中声明 allowedDomains）
        base.push("connect-src 'self' https: wss:");
    }

    return base.join('; ');
}

/**
 * iframe 沙箱属性
 */
export const IFRAME_SANDBOX_ATTR = [
    'allow-scripts',
    'allow-same-origin', // 需要 same-origin 以便 blob URL 工作
    'allow-forms',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
].join(' ');

export interface SandboxConfig {
    pluginId: string;
    manifest: PluginManifest;
    allowedCapabilities: string[];
    csp: string;
    srcDoc?: string; // HTML 文档内容
    src?: string; // 外部 URL（需同源或配置 CORS）
}

export interface PluginRuntimeAPI {
    // 插件可调用的 API
    version: string;
    emit: (event: string, payload?: unknown) => void;
    on: (event: string, handler: (payload: unknown) => void) => () => void;
    injectCSS: (css: string, key?: string) => () => void;
    // Node/Canvas access
    getNode: (id: string) => Promise<unknown>;
    getNodes: () => Promise<unknown[]>;
    getConnections: () => Promise<unknown[]>;
    getUpstream: (nodeId: string) => Promise<unknown[]>;
    getDownstream: (nodeId: string) => Promise<unknown[]>;
    updateNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
    updateMetadata: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
    applyOps: (ops: unknown[]) => Promise<void>;
    getUpstreamNodes: (nodeId: string) => Promise<unknown[]>;
    getDownstreamNodes: (nodeId: string) => Promise<unknown[]>;
    // AI
    ai: {
        generateImage: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        generateVideo: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        generateText: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
        listModels: (capability?: string) => Promise<unknown[]>;
        defaultModel: (capability: string) => Promise<string>;
    };
    // Storage
    storage: {
        get: <T = unknown>(key: string) => Promise<T | null>;
        set: (key: string, value: unknown) => Promise<void>;
        remove: (key: string) => Promise<void>;
    };
    // UI
    openPanel: (nodeId: string) => Promise<void>;
    closePanel: () => Promise<void>;
    // Plugin storage
    pluginStorage: {
        get: <T = unknown>(key: string) => Promise<T | null>;
        set: (key: string, value: unknown) => Promise<void>;
        remove: (key: string) => Promise<void>;
    };
}

export function createDefaultCSP(): string {
    return buildCSP();
}