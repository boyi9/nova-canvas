import { describe, expect, it } from "vitest";

import { navigationGroupOrder, navigationToolFromPath, navigationTools, toolsByGroup } from "@/constant/navigation-tools";
import { ROUTES } from "@/router/routes";

describe("navigation tools", () => {
    it("maps every tool to a unique route from ROUTES", () => {
        const paths = navigationTools.map((tool) => tool.path);
        expect(new Set(paths).size).toBe(paths.length);
        for (const tool of navigationTools) {
            expect(tool.path.startsWith("/")).toBe(true);
        }
        expect(navigationTools.find((tool) => tool.slug === "source-preview")?.path).toBe(ROUTES.sourcePreview);
    });

    it("groups every tool under an ordered group", () => {
        const grouped = navigationGroupOrder.flatMap((group) => toolsByGroup(group));
        expect(grouped).toHaveLength(navigationTools.length);
        expect(new Set(grouped.map((tool) => tool.slug)).size).toBe(navigationTools.length);
    });

    it("resolves the active tool from nested paths", () => {
        expect(navigationToolFromPath("/canvas/project-1")?.slug).toBe("canvas");
        expect(navigationToolFromPath(ROUTES.sourcePreview)?.slug).toBe("source-preview");
    });

    it("does not match unknown or prefix-only paths", () => {
        expect(navigationToolFromPath("/")).toBeUndefined();
        expect(navigationToolFromPath("/source-preview-extra")).toBeUndefined();
        expect(navigationToolFromPath("/not-a-tool")).toBeUndefined();
    });
});
