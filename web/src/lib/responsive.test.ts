import { resolveLayoutMode, shouldCollapseLabels } from "@/lib/responsive";

describe("resolveLayoutMode", () => {
    it("returns mobile for widths below the tablet breakpoint", () => {
        expect(resolveLayoutMode(320)).toBe("mobile");
        expect(resolveLayoutMode(639)).toBe("mobile");
    });

    it("returns tablet between tablet and desktop breakpoints", () => {
        expect(resolveLayoutMode(640)).toBe("tablet");
        expect(resolveLayoutMode(1023)).toBe("tablet");
    });

    it("returns desktop at and above the desktop breakpoint", () => {
        expect(resolveLayoutMode(1024)).toBe("desktop");
        expect(resolveLayoutMode(1920)).toBe("desktop");
    });
});

describe("shouldCollapseLabels", () => {
    it("collapses labels below the desktop breakpoint", () => {
        expect(shouldCollapseLabels(800)).toBe(true);
        expect(shouldCollapseLabels(1024)).toBe(false);
    });
});
