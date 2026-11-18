import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { markOnboardingSeen, readOnboardingDraft, saveOnboardingDraft, starterTemplates } from "@/lib/onboarding";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";

const STEP_KEYS = ["scene", "preference", "ready"] as const;
const RATIOS = ["square", "landscape", "portrait"] as const;
const STYLES = ["realistic", "illustration", "minimal"] as const;

function ChoicePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition", active ? "border-brand bg-brand/5 font-medium text-brand" : "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground")}
        >
            {active ? <Check className="size-3.5" aria-hidden /> : null}
            {label}
        </button>
    );
}

/**
 * 引导页骨架（/onboarding）。
 *
 * 三步收集创作场景与默认偏好，写入 localStorage 后进入工作台。
 * 不渲染 UserLayout，因此是完整的独立页面；后续接入账号体系时可在此补充资料完善步骤。
 */
export default function OnboardingPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const draft = useMemo(() => readOnboardingDraft(), []);
    const [step, setStep] = useState(0);
    const [scene, setScene] = useState(draft?.scene ?? starterTemplates[0].id);
    const [ratio, setRatio] = useState(draft?.ratio ?? RATIOS[0]);
    const [style, setStyle] = useState(draft?.style ?? STYLES[0]);

    const isLastStep = step === STEP_KEYS.length - 1;
    const selectedTemplate = starterTemplates.find((template) => template.id === scene) ?? starterTemplates[0];

    const finish = () => {
        saveOnboardingDraft({ scene, ratio, style });
        markOnboardingSeen();
        navigate(ROUTES.nova);
    };

    const renderStepContent = () => {
        if (STEP_KEYS[step] === "scene") {
            return (
                <div className="grid gap-3 sm:grid-cols-3">
                    {starterTemplates.map((template) => {
                        const active = template.id === scene;
                        return (
                            <button
                                key={template.id}
                                type="button"
                                onClick={() => setScene(template.id)}
                                aria-pressed={active}
                                className={cn("rounded-xl border p-4 text-left transition", active ? "border-brand bg-brand/5" : "border-border hover:border-brand/40")}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{t(template.titleKey)}</span>
                                    {active ? <Check className="size-4 shrink-0 text-brand" aria-hidden /> : null}
                                </div>
                                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t(template.descKey)}</p>
                            </button>
                        );
                    })}
                </div>
            );
        }

        if (STEP_KEYS[step] === "preference") {
            return (
                <div className="space-y-6">
                    <fieldset>
                        <legend className="text-sm font-medium">{t("onboarding.page.ratio")}</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {RATIOS.map((value) => (
                                <ChoicePill key={value} active={ratio === value} label={t(`onboarding.page.ratios.${value}`)} onClick={() => setRatio(value)} />
                            ))}
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend className="text-sm font-medium">{t("onboarding.page.style")}</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {STYLES.map((value) => (
                                <ChoicePill key={value} active={style === value} label={t(`onboarding.page.styles.${value}`)} onClick={() => setStyle(value)} />
                            ))}
                        </div>
                    </fieldset>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <dl className="divide-y divide-border rounded-xl border border-border bg-muted/40 px-4">
                    <div className="flex items-center justify-between py-3 text-sm">
                        <dt className="text-muted-foreground">{t("onboarding.page.summaryScene")}</dt>
                        <dd className="font-medium">{t(selectedTemplate.titleKey)}</dd>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                        <dt className="text-muted-foreground">{t("onboarding.page.summaryRatio")}</dt>
                        <dd className="font-medium">{t(`onboarding.page.ratios.${ratio}`)}</dd>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                        <dt className="text-muted-foreground">{t("onboarding.page.summaryStyle")}</dt>
                        <dd className="font-medium">{t(`onboarding.page.styles.${style}`)}</dd>
                    </div>
                </dl>
                <p className="text-xs leading-5 text-muted-foreground">{t("onboarding.page.summaryHint")}</p>
            </div>
        );
    };

    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <header className="flex h-16 shrink-0 items-center justify-between px-6">
                <Link to={ROUTES.nova} className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="size-5 shrink-0 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} aria-hidden />
                    {t("meta.title")}
                </Link>
                <button type="button" onClick={finish} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {t("onboarding.skip")}
                </button>
            </header>

            <main className="flex flex-1 items-center justify-center px-6 py-10">
                <div className="w-full max-w-3xl">
                    <div className="mb-8 text-center">
                        <p className="text-xs font-medium tracking-[0.2em] text-brand">{t("onboarding.page.eyebrow")}</p>
                        <h1 className="mt-2 text-3xl font-semibold">{t("onboarding.page.heading")}</h1>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("onboarding.page.subheading")}</p>
                    </div>

                    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                        <div className="mb-6 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                            <span>{t("onboarding.page.stepOf", { current: step + 1, total: STEP_KEYS.length })}</span>
                            <div className="flex items-center gap-1.5" aria-hidden>
                                {STEP_KEYS.map((key, index) => (
                                    <span key={key} className={cn("h-1.5 rounded-full transition-all", index === step ? "w-6 bg-brand" : index < step ? "w-3 bg-brand/40" : "w-3 bg-border")} />
                                ))}
                            </div>
                        </div>

                        <h2 className="text-lg font-semibold">{t(`onboarding.page.steps.${STEP_KEYS[step]}.title`)}</h2>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(`onboarding.page.steps.${STEP_KEYS[step]}.desc`)}</p>

                        <div className="mt-6">{renderStepContent()}</div>
                    </section>

                    <div className="mt-6 flex items-center justify-between">
                        <button
                            type="button"
                            disabled={step === 0}
                            onClick={() => setStep((current) => Math.max(0, current - 1))}
                            className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ArrowLeft className="size-4" aria-hidden />
                            {t("onboarding.page.back")}
                        </button>
                        <button
                            type="button"
                            onClick={() => (isLastStep ? finish() : setStep((current) => current + 1))}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-hover"
                        >
                            {isLastStep ? t("onboarding.page.finish") : t("onboarding.next")}
                            <ArrowRight className="size-4" aria-hidden />
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
