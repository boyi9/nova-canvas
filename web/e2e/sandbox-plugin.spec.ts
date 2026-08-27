import { test, expect } from '@playwright/test';

// 在真实浏览器中加载沙箱插件：验证 iframe 沙箱隔离、CSP、能力权限弹窗、
// 插件->宿主事件回传，以及宿主按可序列化 PanelView 渲染声明式面板。
test('sandbox iframe plugin installs, requests permission, and renders a declarative panel', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
        dialogs.push(dialog.message());
        await dialog.accept();
    });

    await page.goto('/e2e/harness.html');
    await page.waitForFunction(() => (window as any).__e2e?.done === true, undefined, { timeout: 25000 });

    const e2e = await page.evaluate(() => (window as any).__e2e);
    expect(e2e.error, e2e.error || '').toBeUndefined();
    expect(e2e.installed).toBe(true);

    expect(e2e.panel).not.toBeNull();
    expect(e2e.panel.title).toContain('示例沙箱插件');
    expect(e2e.panel.status).toBe('done');
    expect(e2e.panel.image).toContain('data:image');

    // iframe 就绪事件应已回传给宿主订阅者。
    expect(e2e.events.some((e: any) => e.type === 'iframe:ready')).toBe(true);

    // 高风险能力 ai:generate 应触发一次权限弹窗。
    expect(dialogs.some((m) => m.includes('插件请求权限'))).toBe(true);
});
