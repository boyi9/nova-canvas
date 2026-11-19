import { expect, test, type Locator, type Page } from "@playwright/test";

const worldLayer = '[data-testid="canvas-world-layer"]';

async function readViewport(page: Page) {
    const layer = page.locator(worldLayer);
    return {
        x: Number(await layer.getAttribute("data-viewport-x")),
        y: Number(await layer.getAttribute("data-viewport-y")),
        k: Number(await layer.getAttribute("data-viewport-k")),
    };
}

async function openNewCanvas(page: Page) {
    await page.goto("/canvas?mode=new");
    await expect(page).toHaveURL(/\/canvas\/[^/?]+/);
    const container = page.getByTestId("canvas-container");
    await expect(container).toBeVisible();
    return container;
}

/** 等待容器布局稳定（侧边面板/Agent 面板会做一次宽度过渡）。 */
async function waitForStableBox(page: Page, container: Locator) {
    let previous = await container.boundingBox();
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        const next = await container.boundingBox();
        if (next && previous && Math.abs(next.width - previous.width) < 0.5 && Math.abs(next.height - previous.height) < 0.5) return next;
        previous = next;
    }
    return previous;
}

test.beforeEach(async ({ page }) => {
    // 跳过首次引导弹窗，避免遮挡画布交互。
    await page.addInitScript(() => window.localStorage.setItem("nova_onboarded", "1"));
    await page.setViewportSize({ width: 1280, height: 800 });
});

test("new canvas puts the world origin at the container center", async ({ page }) => {
    const container = await openNewCanvas(page);
    await waitForStableBox(page, container);

    await expect.poll(async () => (await readViewport(page)).k).toBeCloseTo(1, 5);
    await expect
        .poll(async () => {
            const box = await container.boundingBox();
            return Math.abs((await readViewport(page)).x - (box?.width ?? 0) / 2);
        })
        .toBeLessThan(1);
    await expect
        .poll(async () => {
            const box = await container.boundingBox();
            return Math.abs((await readViewport(page)).y - (box?.height ?? 0) / 2);
        })
        .toBeLessThan(1);
});

test("wheel zoom keeps the world point under the cursor fixed", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const before = await readViewport(page);
    const worldBefore = {
        x: (box!.width / 2 - before.x) / before.k,
        y: (box!.height / 2 - before.y) / before.k,
    };

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await readViewport(page)).k).toBeGreaterThan(1);

    const after = await readViewport(page);
    const worldAfter = {
        x: (box!.width / 2 - after.x) / after.k,
        y: (box!.height / 2 - after.y) / after.k,
    };
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(0.5);
});

test("reset restores 100% zoom with the origin centered", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await readViewport(page)).k).toBeGreaterThan(1);

    await page.getByTestId("canvas-reset-view").click();
    await expect.poll(async () => (await readViewport(page)).k).toBeCloseTo(1, 5);
    await expect
        .poll(async () => {
            const nextBox = await container.boundingBox();
            return Math.abs((await readViewport(page)).x - (nextBox?.width ?? 0) / 2);
        })
        .toBeLessThan(1);
    await expect
        .poll(async () => {
            const nextBox = await container.boundingBox();
            return Math.abs((await readViewport(page)).y - (nextBox?.height ?? 0) / 2);
        })
        .toBeLessThan(1);
});

test("container resize keeps the world center stable", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const before = await readViewport(page);
    const worldBefore = {
        x: (box!.width / 2 - before.x) / before.k,
        y: (box!.height / 2 - before.y) / before.k,
    };

    await page.setViewportSize({ width: 1000, height: 700 });
    await waitForStableBox(page, container);

    await expect
        .poll(async () => {
            const nextBox = await container.boundingBox();
            if (!nextBox) return Number.POSITIVE_INFINITY;
            const viewport = await readViewport(page);
            return Math.abs((nextBox.width / 2 - viewport.x) / viewport.k - worldBefore.x);
        })
        .toBeLessThan(1);
    await expect
        .poll(async () => {
            const nextBox = await container.boundingBox();
            if (!nextBox) return Number.POSITIVE_INFINITY;
            const viewport = await readViewport(page);
            return Math.abs((nextBox.height / 2 - viewport.y) / viewport.k - worldBefore.y);
        })
        .toBeLessThan(1);
});

test("minimap can be toggled on the canvas", async ({ page }) => {
    await openNewCanvas(page);
    await page.getByTestId("canvas-toggle-minimap").click();
    await expect(page.getByTestId("canvas-minimap")).toBeVisible();
});
