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

/** 屏幕点（容器本地坐标）对应的世界坐标，独立于实现复算公式，用于交叉验证。 */
function worldUnder(viewport: { x: number; y: number; k: number }, screenX: number, screenY: number) {
    return {
        x: (screenX - viewport.x) / viewport.k,
        y: (screenY - viewport.y) / viewport.k,
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

test("wheel zoom anchors on an off-center cursor position", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    // 故意避开容器中心：中心锚点即使算错也容易蒙混过关。
    const localX = box!.width * 0.27;
    const localY = box!.height * 0.36;
    const before = await readViewport(page);
    const worldBefore = worldUnder(before, localX, localY);

    await page.mouse.move(box!.x + localX, box!.y + localY);
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => (await readViewport(page)).k).toBeGreaterThan(before.k * 1.2);

    const after = await readViewport(page);
    const worldAfter = worldUnder(after, localX, localY);
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(0.5);
});

test("repeated wheel events accumulate zoom around the cursor", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const localX = box!.width * 0.62;
    const localY = box!.height * 0.44;
    const before = await readViewport(page);
    const worldBefore = worldUnder(before, localX, localY);

    await page.mouse.move(box!.x + localX, box!.y + localY);
    for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, -100);
    }
    await expect.poll(async () => (await readViewport(page)).k).toBeGreaterThan(1.4);

    const after = await readViewport(page);
    const worldAfter = worldUnder(after, localX, localY);
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(0.5);
});

test("wheel zoom clamps between 5% and 500%", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -20000);
    await expect.poll(async () => (await readViewport(page)).k).toBeCloseTo(5, 5);

    await page.mouse.wheel(0, 200000);
    await expect.poll(async () => (await readViewport(page)).k).toBeCloseTo(0.05, 5);
});

test("space + drag pans the viewport without changing zoom", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const before = await readViewport(page);

    await page.mouse.move(start.x, start.y);
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(start.x + 140, start.y + 90, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Space");

    await expect
        .poll(async () => {
            const after = await readViewport(page);
            return Math.max(Math.abs(after.x - before.x - 140), Math.abs(after.y - before.y - 90), Math.abs(after.k - before.k));
        })
        .toBeLessThan(1);
});

test("middle-button drag pans the viewport", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const start = { x: box!.x + box!.width * 0.55, y: box!.y + box!.height * 0.45 };
    const before = await readViewport(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(start.x - 120, start.y - 70, { steps: 8 });
    await page.mouse.up({ button: "middle" });

    await expect
        .poll(async () => {
            const after = await readViewport(page);
            return Math.max(Math.abs(after.x - before.x + 120), Math.abs(after.y - before.y + 70), Math.abs(after.k - before.k));
        })
        .toBeLessThan(1);
});

test("double-click maps the screen point to the same world position for the new node", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    // 先缩放，确保断言覆盖 k != 1 的坐标换算。
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => (await readViewport(page)).k).toBeGreaterThan(1.2);

    const target = { x: box!.x + box!.width * 0.32, y: box!.y + box!.height * 0.38 };
    await page.mouse.dblclick(target.x, target.y);

    const menu = page.getByTestId("canvas-node-create-menu");
    await expect(menu).toBeVisible();
    await expect
        .poll(async () => {
            const menuBox = await menu.boundingBox();
            if (!menuBox) return Number.POSITIVE_INFINITY;
            return Math.max(Math.abs(menuBox.x - target.x), Math.abs(menuBox.y - target.y));
        })
        .toBeLessThan(2);

    await menu.locator('[data-node-type="text"]').first().click();

    const node = page.locator("[data-node-id]").first();
    await expect(node).toBeVisible();
    await expect
        .poll(async () => {
            const nodeBox = await node.boundingBox();
            if (!nodeBox) return Number.POSITIVE_INFINITY;
            return Math.max(Math.abs(nodeBox.x + nodeBox.width / 2 - target.x), Math.abs(nodeBox.y + nodeBox.height / 2 - target.y));
        })
        .toBeLessThan(2);
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
