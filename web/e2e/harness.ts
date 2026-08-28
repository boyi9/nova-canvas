import {
    loadIframePluginFromUrl,
    runIframeScriptFromUrl,
    setIframeHostBridge,
    subscribeAllPluginEvents,
    getIframePlugin,
    type IframeHostBridge,
} from '@/lib/canvas/plugin-iframe-loader';
import { useSandboxPanelStore } from '@/stores/canvas/use-sandbox-panel-store';

// 真实浏览器内的沙箱插件端到端校验：使用真实 loader + 真实 iframe 沙箱（CSP）跑通
// 安装 -> 权限弹窗 -> 事件 RPC -> 声明式面板渲染 全链路；脚本模式覆盖 applyOps 回写。
const events: Array<{ pluginId: string; type: string; payload?: unknown }> = [];
subscribeAllPluginEvents((pluginId, ev) => {
    events.push({ pluginId, type: ev.type, payload: ev.payload });
});
const capturedOps: unknown[] = [];

// 宿主桥：仅桩接，验证沙箱插件对 canvas/ai 能力的 RPC 调用能到达宿主侧并处理。
const hostBridge: IframeHostBridge = {
    getNode: async () => ({}),
    getNodes: async () => [],
    getConnections: async () => [],
    getUpstream: async () => [],
    getDownstream: async () => [],
    updateNode: async () => undefined,
    updateMetadata: async () => undefined,
    applyOps: async (ops: unknown[]) => {
        capturedOps.push(...ops);
    },
    ai: {
        generateImage: async () =>
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        generateVideo: async () => '',
        generateText: async () => '',
        listModels: async () => [],
        defaultModel: async () => '',
    },
};

setIframeHostBridge(hostBridge);

async function runScript(url: string): Promise<void> {
    await runIframeScriptFromUrl(url);
    const id = 'script:script-echo';
    const start = Date.now();
    while (Date.now() - start < 8000) {
        const panel = useSandboxPanelStore.getState().panels[id];
        if (panel && panel.status === 'done') break;
        await new Promise((r) => setTimeout(r, 150));
    }
    (window as any).__e2e = {
        ...((window as any).__e2e || {}),
        scriptInstalled: !!getIframePlugin('script:script-echo'),
        scriptPanel: useSandboxPanelStore.getState().panels['script:script-echo'] ?? null,
        scriptOpsCount: capturedOps.length,
        done: true,
    };
}

async function main() {
    await loadIframePluginFromUrl('/plugins/sandbox-sample.json');
    const start = Date.now();
    // 轮询等待插件 run() 完成（getNodes -> getConnections -> ai.generateImage -> renderPanel）。
    while (Date.now() - start < 8000) {
        const panel = useSandboxPanelStore.getState().panels['sandbox-sample'];
        if (panel && panel.status === 'done') break;
        await new Promise((r) => setTimeout(r, 150));
    }
    (window as any).__e2e = {
        installed: !!getIframePlugin('sandbox-sample'),
        panel: useSandboxPanelStore.getState().panels['sandbox-sample'] ?? null,
        events,
        runScript,
        done: true,
    };
}

main().catch((err) => {
    (window as any).__e2e = { error: String((err && (err as Error).message) || err), done: true };
});
