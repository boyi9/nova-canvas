import { expect, test } from "@playwright/test";

const sidebar = '[data-testid="app-sidebar"]';
const topNav = '[data-testid="app-top-nav"]';

test("desktop sidebar navigates and persists collapse state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/home");

    await expect(page.locator(sidebar)).toBeVisible();

    await page.locator(`${sidebar} a[href='/prompts']`).click();
    await expect(page).toHaveURL(/\/prompts$/);
    await expect(page.locator(`${sidebar} a[aria-current='page']`)).toHaveAttribute("href", "/prompts");

    await page.locator(`${sidebar} button[aria-expanded]`).click();
    await expect(page.locator(sidebar)).toHaveAttribute("data-collapsed", "true");

    await page.reload();
    await expect(page.locator(sidebar)).toHaveAttribute("data-collapsed", "true");
});

test("canvas project hides the shell navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/canvas?mode=new");

    await expect(page).toHaveURL(/\/canvas\/[^/?]+/);
    await expect(page.locator(sidebar)).toHaveCount(0);
    await expect(page.locator(topNav)).toHaveCount(0);
});

test("mobile navigation uses the drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");

    await expect(page.locator(sidebar)).toBeHidden();

    await page.locator(`${topNav} button`).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    await drawer.locator("a[href='/assets']").click();
    await expect(page).toHaveURL(/\/assets$/);
});
