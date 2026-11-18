// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import StatusPage from "@/pages/status";

const KINDS = ["forbidden", "empty", "loading", "maintenance", "networkError", "insufficientCredits"] as const;

describe("status pages", () => {
    it.each(KINDS)("renders the translated title for %s", (kind) => {
        render(
            <MemoryRouter>
                <StatusPage kind={kind} />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(i18n.t(`statusPages.${kind}.title`));
    });

    it("offers a back-home action on the forbidden page", () => {
        render(
            <MemoryRouter>
                <StatusPage kind="forbidden" />
            </MemoryRouter>,
        );

        expect(screen.getByRole("link", { name: i18n.t("stateActions.backHome") })).toHaveAttribute("href", "/");
    });

    it("shows a spinner instead of a status icon while loading", () => {
        const { container } = render(
            <MemoryRouter>
                <StatusPage kind="loading" />
            </MemoryRouter>,
        );

        expect(container.querySelector("svg.animate-spin")).toBeTruthy();
    });
});
