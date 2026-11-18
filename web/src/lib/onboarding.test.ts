import { onboardingSteps, starterTemplates, markOnboardingSeen, hasSeenOnboarding, readOnboardingDraft, saveOnboardingDraft } from "@/lib/onboarding";

describe("onboarding data", () => {
    it("exposes at least one step and one starter template", () => {
        expect(onboardingSteps.length).toBeGreaterThan(0);
        expect(starterTemplates.length).toBeGreaterThan(0);
    });

    it("steps carry an icon component and i18n keys", () => {
        for (const step of onboardingSteps) {
            expect(step.icon).toBeTruthy();
            expect(typeof step.icon).toMatch(/^(function|object)$/);
            expect(step.titleKey).toMatch(/^onboarding\.step\./);
            expect(step.descKey).toMatch(/^onboarding\.step\./);
        }
    });

    it("tracks seen state via localStorage flag", () => {
        localStorage.removeItem("nova_onboarded");
        expect(hasSeenOnboarding()).toBe(false);
        markOnboardingSeen();
        expect(hasSeenOnboarding()).toBe(true);
    });

    it("persists and restores the onboarding draft", () => {
        localStorage.removeItem("nova_onboarding_draft");
        expect(readOnboardingDraft()).toBeNull();

        saveOnboardingDraft({ scene: "shortvideo", ratio: "portrait", style: "minimal" });
        expect(readOnboardingDraft()).toEqual({ scene: "shortvideo", ratio: "portrait", style: "minimal" });
    });

    it("ignores malformed onboarding drafts", () => {
        localStorage.setItem("nova_onboarding_draft", "{not-json");
        expect(readOnboardingDraft()).toBeNull();

        localStorage.setItem("nova_onboarding_draft", JSON.stringify({ scene: "ad" }));
        expect(readOnboardingDraft()).toBeNull();
    });
});
