import { onboardingSteps, starterTemplates, markOnboardingSeen, hasSeenOnboarding } from "@/lib/onboarding";

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
});
