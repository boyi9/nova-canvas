import { test, expect } from "@playwright/test";

// 校验「生图脚本」模式：在真实浏览器中以隔离 iframe 运行脚本，并通过 applyOps 将结果回写画布。
test("sandbox generation script runs in isolation and writes back via applyOps", async ({ page, context }) => {
    const dialogs: string[] = [];
    context.on("dialog", (dialog) => {
        dialogs.push(dialog.message());
        dialog.accept().catch(() => {});
    });

    await page.goto("/e2e/harness.html");
    await page.waitForFunction(() => (window as any).__e2e?.done === true, null, { timeout: 15000 });

    // 通过真实 loader 以脚本模式运行（raw JS 经沙箱 + hostBridge）。
    await page.evaluate(() => (window as any).__e2e.runScript("/plugins/scripts/script-echo.js"));
    await page.waitForFunction(
        () => {
            const e2e = (window as any).__e2e;
            return e2e?.scriptPanel && e2e.scriptPanel.status === "done";
        },
        null,
        { timeout: 10000 },
    );

    const result = await page.evaluate(() => (window as any).__e2e);
    expect(result.scriptInstalled).toBe(true);
    expect(result.scriptPanel.title).toContain("Echo");
    // applyOps 必须到达宿主侧（脚本模式的结果回写）。
    expect(result.scriptOpsCount).toBeGreaterThan(0);
    // 脚本运行需申请 canvas:write，应出现权限请求弹窗。
    expect(dialogs.some((m) => m.includes("插件请求权限"))).toBe(true);
});
