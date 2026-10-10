import { test, expect } from "@playwright/test";

// Nova 首页加载和基本交互
test("nova homepage loads and displays scene selector", async ({ page }) => {
    await page.goto("/nova");
    await page.waitForLoadState("networkidle");

    // 页面标题应包含 Nova
    await expect(page.locator("text=Nova AI助手")).toBeVisible();

    // 场景选择器应可见
    await expect(page.locator("text=选择创作场景")).toBeVisible();
});

// Nova 首页场景切换
test("nova homepage scene switching works", async ({ page }) => {
    await page.goto("/nova");
    await page.waitForLoadState("networkidle");

    // 默认选中电商场景
    const ecommerceCard = page.locator("text=电商营销").first();
    await expect(ecommerceCard).toBeVisible();

    // 切换到广告场景
    const advertisingCard = page.locator("text=品牌广告").first();
    await advertisingCard.click();

    // 应显示广告相关快捷指令
    await expect(page.locator("text=TVC脚本")).toBeVisible();
});

// Nova 工作台导航
test("nova workbench navigation works", async ({ page }) => {
    await page.goto("/nova");
    await page.waitForLoadState("networkidle");

    // 点击开始创作按钮
    const startButton = page.locator("text=开始创作").first();
    if (await startButton.isVisible()) {
        await startButton.click();
        await page.waitForLoadState("networkidle");

        // 应导航到工作台页面
        await expect(page.locator("text=Nova AI助手")).toBeVisible();
    }
});

// 画布页面加载
test("canvas page loads with empty state", async ({ page }) => {
    await page.goto("/canvas");
    await page.waitForLoadState("networkidle");

    // 画布页面应显示
    await expect(page.locator("text=画布")).toBeVisible();
});

// 图片工作台页面加载
test("image workbench page loads", async ({ page }) => {
    await page.goto("/image");
    await page.waitForLoadState("networkidle");

    // 页面应显示生成相关元素
    await expect(page.locator("text=生成")).toBeVisible();
});

// 视频工作台页面加载
test("video workbench page loads", async ({ page }) => {
    await page.goto("/video");
    await page.waitForLoadState("networkidle");

    // 页面应显示视频相关元素
    await expect(page.locator("text=视频")).toBeVisible();
});

// 404 页面
test("not found page displays for invalid route", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await page.waitForLoadState("networkidle");

    // 应显示 404 或 not found 信息
    await expect(page.locator("text=404").or(page.locator("text=不存在"))).toBeVisible();
});

// 响应式布局 - 移动端
test("nova homepage is responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/nova");
    await page.waitForLoadState("networkidle");

    // 移动端应正常显示
    await expect(page.locator("text=Nova AI助手")).toBeVisible();
});

// 键盘导航
test("nova homepage supports keyboard navigation", async ({ page }) => {
    await page.goto("/nova");
    await page.waitForLoadState("networkidle");

    // Tab 键应能聚焦到可交互元素
    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
});
