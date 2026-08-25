import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Modal, Button } from "antd";

import { createProject } from "@/services/nova/api";
import { onboardingSteps, starterTemplates, markOnboardingSeen, type StarterTemplate } from "@/lib/onboarding";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function OnboardingModal({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);
    const [creating, setCreating] = useState<string | null>(null);
    const total = onboardingSteps.length;
    const current = onboardingSteps[step];
    const Icon = current.icon;

    const finish = () => {
        markOnboardingSeen();
        onClose();
    };

    const startTemplate = async (tmpl: StarterTemplate) => {
        setCreating(tmpl.id);
        try {
            await createProject(t(tmpl.titleKey), tmpl.scene);
        } finally {
            setCreating(null);
            finish();
        }
    };

    return (
        <Modal open={open} onCancel={finish} footer={null} width={640} centered>
            <div className="flex flex-col items-center gap-4 p-2 text-center">
                <div className="grid size-16 place-items-center rounded-2xl bg-black/5 dark:bg-white/10">
                    <Icon className="size-8" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold">{t(current.titleKey)}</h2>
                    <p className="mt-1 text-sm text-black/60 dark:text-white/60">{t(current.descKey)}</p>
                </div>

                <div className="flex w-full gap-2">
                    {starterTemplates.map((tmpl) => (
                        <button
                            key={tmpl.id}
                            type="button"
                            disabled={creating !== null}
                            onClick={() => startTemplate(tmpl)}
                            className="flex-1 rounded-xl border border-black/10 p-3 text-left text-xs transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                        >
                            <div className="font-medium">{t(tmpl.titleKey)}</div>
                            <div className="mt-0.5 text-black/50 dark:text-white/50">{t(tmpl.descKey)}</div>
                        </button>
                    ))}
                </div>

                <div className="flex w-full items-center justify-between pt-2">
                    <div className="flex gap-1">
                        {onboardingSteps.map((s, i) => (
                            <span
                                key={s.id}
                                className={`h-1.5 rounded-full transition ${i === step ? "w-5 bg-black/70 dark:bg-white/70" : "w-1.5 bg-black/20 dark:bg-white/20"}`}
                            />
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={finish}>{t("onboarding.skip")}</Button>
                        {step < total - 1 ? (
                            <Button type="primary" onClick={() => setStep((s) => s + 1)}>
                                {t("onboarding.next")}
                            </Button>
                        ) : (
                            <Button type="primary" onClick={finish}>
                                {t("onboarding.start")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export function MembershipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    return (
        <Modal open={open} onCancel={onClose} footer={null} width={760} centered>
            <div className="grid gap-3 p-1 sm:grid-cols-3">
                {membershipPlans.map((plan) => (
                    <div
                        key={plan.id}
                        className={`rounded-2xl border p-4 ${plan.highlight ? "border-black/60 dark:border-white/60" : "border-black/10 dark:border-white/10"}`}
                    >
                        <h3 className="text-base font-semibold">{t(plan.nameKey)}</h3>
                        <p className="mt-1 text-sm text-black/60 dark:text-white/60">{t(plan.priceKey)}</p>
                        <ul className="mt-3 space-y-1.5 text-xs">
                            {plan.featuresKey.map((f) => (
                                <li key={f} className="flex items-start gap-1.5">
                                    <Check className="mt-0.5 size-3.5 shrink-0" />
                                    <span>{t(f)}</span>
                                </li>
                            ))}
                        </ul>
                        <Button type={plan.highlight ? "primary" : "default"} block className="mt-4">
                            {t("membership.cta")}
                        </Button>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
