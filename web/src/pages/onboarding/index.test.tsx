// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "@/i18n";
import i18n from "@/i18n";
import OnboardingPage from "@/pages/onboarding";

function renderOnboarding() {
    return render(
        <MemoryRouter initialEntries={["/onboarding"]}>
            <Routes>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/" element={<div>workbench-home</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("onboarding page", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("walks through the three steps and saves the draft on finish", () => {
        renderOnboarding();

        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(i18n.t("onboarding.page.steps.scene.title"));

        fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.next") }));
        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(i18n.t("onboarding.page.steps.preference.title"));

        fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.next") }));
        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(i18n.t("onboarding.page.steps.ready.title"));

        fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.page.finish") }));

        expect(screen.getByText("workbench-home")).toBeInTheDocument();
        expect(localStorage.getItem("nova_onboarded")).toBe("1");
        expect(JSON.parse(localStorage.getItem("nova_onboarding_draft")!)).toEqual({
            scene: "ecommerce",
            ratio: "square",
            style: "realistic",
        });
    });

    it("restores a previously saved draft", () => {
        localStorage.setItem("nova_onboarding_draft", JSON.stringify({ scene: "ad", ratio: "portrait", style: "minimal" }));
        renderOnboarding();

        fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.next") }));
        fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.next") }));

        expect(screen.getByText(i18n.t("onboarding.template.ad.title"))).toBeInTheDocument();
        expect(screen.getByText(i18n.t("onboarding.page.ratios.portrait"))).toBeInTheDocument();
        expect(screen.getByText(i18n.t("onboarding.page.styles.minimal"))).toBeInTheDocument();
    });
});
