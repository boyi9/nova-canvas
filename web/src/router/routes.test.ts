import { describe, expect, it } from "vitest";

import { canvasProjectPath, isCanvasProjectPath, ROUTE_PATHS, ROUTES } from "@/router/routes";

describe("route table", () => {
    it("keeps every path unique", () => {
        expect(new Set(ROUTE_PATHS).size).toBe(ROUTE_PATHS.length);
    });

    it("uses absolute paths", () => {
        for (const path of ROUTE_PATHS) {
            expect(path.startsWith("/")).toBe(true);
        }
    });

    it("encodes dynamic canvas project ids", () => {
        expect(canvasProjectPath("abc 123")).toBe("/canvas/abc%20123");
        expect(canvasProjectPath("a/b")).toBe("/canvas/a%2Fb");
    });

    it("treats only canvas project details as immersive routes", () => {
        expect(isCanvasProjectPath(ROUTES.canvas)).toBe(false);
        expect(isCanvasProjectPath(canvasProjectPath("project-1"))).toBe(true);
        expect(isCanvasProjectPath(`${ROUTES.canvas}/project-1/extra`)).toBe(false);
        expect(isCanvasProjectPath(ROUTES.home)).toBe(false);
    });

    it("exposes the canvas project template with its param", () => {
        expect(ROUTES.canvasProject).toBe("/canvas/:id");
    });

    it("exposes shell-free entry and status routes", () => {
        expect(ROUTES.login).toBe("/login");
        expect(ROUTES.onboarding).toBe("/onboarding");
        expect(ROUTES.forbidden).toBe("/403");
        expect(ROUTES.empty).toBe("/empty");
        expect(ROUTES.loading).toBe("/loading");
        expect(ROUTES.maintenance).toBe("/maintenance");
        expect(ROUTES.networkError).toBe("/network-error");
        expect(ROUTES.insufficientCredits).toBe("/insufficient-credits");
    });
});
