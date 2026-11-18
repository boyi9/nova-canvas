import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { canvasProjectPath, ROUTES } from "@/router/routes";
import { useNavStore } from "@/stores/use-nav-store";

function renderSidebar(pathname: string = ROUTES.nova) {
    return render(
        <MemoryRouter initialEntries={[pathname]}>
            <AppSidebar />
        </MemoryRouter>,
    );
}

describe("app sidebar", () => {
    beforeEach(() => {
        useNavStore.setState({ sidebarCollapsed: false });
        localStorage.clear();
    });

    it("marks only the current route as active", () => {
        renderSidebar(canvasProjectPath("demo"));

        const links = screen.getAllByRole("link");
        const active = links.filter((link) => link.getAttribute("aria-current") === "page");

        expect(active).toHaveLength(1);
        expect(active[0]).toHaveAttribute("href", ROUTES.canvas);
        expect(active[0]).toHaveTextContent(i18n.t("navigation.canvas"));
    });

    it("toggles and persists the collapsed state", () => {
        renderSidebar();

        fireEvent.click(screen.getByRole("button", { name: i18n.t("sidebar.collapse") }));

        expect(useNavStore.getState().sidebarCollapsed).toBe(true);
        expect(screen.getByRole("button", { name: i18n.t("sidebar.expand") })).toHaveAttribute("aria-expanded", "false");
        expect(JSON.parse(localStorage.getItem("nova-canvas:nav_store") ?? "{}").state.sidebarCollapsed).toBe(true);
    });

    it("uses ROUTES paths instead of raw slugs", () => {
        renderSidebar();

        const sourcePreview = screen.getByRole("link", { name: i18n.t("navigation.source-preview") });
        expect(sourcePreview).toHaveAttribute("href", ROUTES.sourcePreview);
    });
});
