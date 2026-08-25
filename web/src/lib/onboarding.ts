import { BookOpen, Bot, Images, Sparkles, Split, Wand2 } from "lucide-react";

export interface OnboardingStep {
    id: string;
    icon: typeof Wand2;
    titleKey: string;
    descKey: string;
}

export const onboardingSteps: OnboardingStep[] = [
    { id: "canvas", icon: Wand2, titleKey: "onboarding.step.canvas.title", descKey: "onboarding.step.canvas.desc" },
    { id: "provider", icon: Sparkles, titleKey: "onboarding.step.provider.title", descKey: "onboarding.step.provider.desc" },
    { id: "batch", icon: Images, titleKey: "onboarding.step.batch.title", descKey: "onboarding.step.batch.desc" },
    { id: "fission", icon: Split, titleKey: "onboarding.step.fission.title", descKey: "onboarding.step.fission.desc" },
    { id: "agent", icon: Bot, titleKey: "onboarding.step.agent.title", descKey: "onboarding.step.agent.desc" },
    { id: "library", icon: BookOpen, titleKey: "onboarding.step.library.title", descKey: "onboarding.step.library.desc" },
];

export interface StarterTemplate {
    id: string;
    titleKey: string;
    descKey: string;
    scene: string;
}

export const starterTemplates: StarterTemplate[] = [
    { id: "ecommerce", titleKey: "onboarding.template.ecommerce.title", descKey: "onboarding.template.ecommerce.desc", scene: "ecommerce" },
    { id: "shortvideo", titleKey: "onboarding.template.shortvideo.title", descKey: "onboarding.template.shortvideo.desc", scene: "shortvideo" },
    { id: "ad", titleKey: "onboarding.template.ad.title", descKey: "onboarding.template.ad.desc", scene: "ad" },
];

const ONBOARDING_FLAG = "nova_onboarded";

export function hasSeenOnboarding(): boolean {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(ONBOARDING_FLAG) === "1";
}

export function markOnboardingSeen(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ONBOARDING_FLAG, "1");
}
