import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function createNodeAt(page: Page, x: number, y: number, type: string) {
    await page.mouse.dblclick(x, y);
    const menu = page.getByTestId("canvas-node-create-menu");
    await expect(menu).toBeVisible();
    await menu.locator(`[data-node-type="${type}"]`).first().click();
    await expect(menu).toBeHidden();
}

async function readViewport(page: Page) {
    const layer = page.locator('[data-testid="canvas-world-layer"]');
    return {
        x: Number(await layer.getAttribute("data-viewport-x")),
        y: Number(await layer.getAttribute("data-viewport-y")),
        k: Number(await layer.getAttribute("data-viewport-k")),
    };
}

/** 页面坐标 -> 世界坐标，独立于实现复算，避免面板展开引起布局位移时误判。 */
async function worldCenterOf(page: Page, node: Locator) {
    const box = await page.getByTestId("canvas-container").boundingBox();
    const nodeBox = await node.boundingBox();
    if (!box || !nodeBox) return null;
    const viewport = await readViewport(page);
    return {
        x: (nodeBox.x + nodeBox.width / 2 - box.x - viewport.x) / viewport.k,
        y: (nodeBox.y + nodeBox.height / 2 - box.y - viewport.y) / viewport.k,
    };
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("nova_onboarded", "1"));
    await page.setViewportSize({ width: 1280, height: 800 });
});

test("rectangle renders an inset rounded SVG rect with its metadata style", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const center = { x: box!.x + box!.width * 0.42, y: box!.y + box!.height * 0.25 };
    const startViewport = await readViewport(page);
    const targetWorld = { x: (center.x - box!.x - startViewport.x) / startViewport.k, y: (center.y - box!.y - startViewport.y) / startViewport.k };
    await createNodeAt(page, center.x, center.y, "rectangle");

    const node = page.locator('[data-node-id^="rectangle-"]');
    await expect(node).toHaveCount(1);
    await expect(node).toBeVisible();

    // 默认尺寸 320x200，双击点落在节点中心（面板展开动画会短暂改变画布宽度，需轮询到稳定值）。
    await expect
        .poll(async () => {
            const current = await node.boundingBox();
            if (!current) return Number.POSITIVE_INFINITY;
            return Math.max(Math.abs(current.width - 320), Math.abs(current.height - 200));
        })
        .toBeLessThan(0.5);
    await expect
        .poll(async () => {
            const world = await worldCenterOf(page, node);
            if (!world) return Number.POSITIVE_INFINITY;
            return Math.max(Math.abs(world.x - targetWorld.x), Math.abs(world.y - targetWorld.y));
        })
        .toBeLessThan(0.5);

    const svg = node.locator('svg[data-shape-kind="rect"]');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute("viewBox", "0 0 320 200");

    const rect = svg.locator('rect[data-shape-part="outline"]');
    await expect(rect).toHaveAttribute("x", "1");
    await expect(rect).toHaveAttribute("y", "1");
    await expect(rect).toHaveAttribute("width", "318");
    await expect(rect).toHaveAttribute("height", "198");
    await expect(rect).toHaveAttribute("rx", "16");
    await expect(rect).toHaveAttribute("fill", "#dbeafe");
    await expect(rect).toHaveAttribute("stroke", "#2563eb");
    await expect(rect).toHaveAttribute("stroke-width", "2");

    // 图元节点使用透明底色，不应再叠加底部渐变遮罩。
    const card = node.locator(":scope > div.rounded-3xl.border-2").first();
    const cardStyle = await card.evaluate((element) => {
        const computed = window.getComputedStyle(element);
        return { background: computed.backgroundColor, backgroundImage: computed.backgroundImage };
    });
    expect(cardStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(cardStyle.backgroundImage).toBe("none");
    await expect(node.locator('div[style*="linear-gradient"]')).toHaveCount(0);
});

test("circle renders a centred ellipse and keeps its aspect ratio when resized", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const center = { x: box!.x + box!.width * 0.55, y: box!.y + box!.height * 0.15 };
    await createNodeAt(page, center.x, center.y, "circle");

    const node = page.locator('[data-node-id^="circle-"]');
    await expect(node).toHaveCount(1);

    const nodeBox = await node.boundingBox();
    expect(nodeBox).not.toBeNull();
    expect(nodeBox!.width).toBeCloseTo(240, 0);
    expect(nodeBox!.height).toBeCloseTo(240, 0);

    const svg = node.locator('svg[data-shape-kind="ellipse"]');
    await expect(svg).toBeVisible();
    const ellipse = svg.locator('ellipse[data-shape-part="outline"]');
    await expect(ellipse).toHaveAttribute("cx", "120");
    await expect(ellipse).toHaveAttribute("cy", "120");
    await expect(ellipse).toHaveAttribute("rx", "119");
    await expect(ellipse).toHaveAttribute("ry", "119");
    await expect(ellipse).toHaveAttribute("fill", "#dcfce7");
    await expect(ellipse).toHaveAttribute("stroke", "#16a34a");

    // 拖拽右下角手柄横向拉伸，圆形节点应保持宽高比 1:1。
    await node.hover();
    const handle = node.locator('[data-resize-handle="bottom-right"]');
    await expect(handle).toHaveCount(1);
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 90, handleBox!.y + handleBox!.height / 2, { steps: 6 });
    await page.mouse.up();

    const resized = await node.boundingBox();
    expect(resized).not.toBeNull();
    expect(resized!.width).toBeGreaterThan(300);
    expect(resized!.width / resized!.height).toBeCloseTo(1, 1);
});

test("image node renders an uploaded file through an object URL", async ({ page }) => {
    await openNewCanvas(page);

    // 64x64 SVG：走与用户上传相同的本地存储路径，不依赖后端。
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ef4444"/></svg>');
    await page.locator('input[type="file"][accept*="audio/mpeg"]').setInputFiles({ name: "pixel.svg", mimeType: "image/svg+xml", buffer: svg });

    const node = page.locator('[data-node-id^="image-"]').first();
    await expect(node).toBeVisible();

    const image = node.locator('img[src^="blob:"]').first();
    await expect(image).toBeVisible();
    await expect.poll(async () => image.getAttribute("src")).toMatch(/^blob:/);
    await expect
        .poll(async () => {
            const imageBox = await image.boundingBox();
            return imageBox ? Math.min(imageBox.width, imageBox.height) : 0;
        })
        .toBeGreaterThan(0);
});

test("text node drafts render as plain text on the canvas", async ({ page }) => {
    const container = await openNewCanvas(page);
    const box = await waitForStableBox(page, container);
    expect(box).not.toBeNull();

    const center = { x: box!.x + box!.width * 0.5, y: box!.y + box!.height * 0.5 };
    await createNodeAt(page, center.x, center.y, "text");

    const node = page.locator('[data-node-id^="text-"]');
    await expect(node).toHaveCount(1);
    await node.dblclick();

    const textarea = node.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("你好 Nova");
    await textarea.press("Escape");

    await expect(node.getByText("你好 Nova")).toBeVisible();
});
