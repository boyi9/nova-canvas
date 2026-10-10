import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Modal, Button, message } from "antd";

import { createProjectSmart } from "@/services/nova/api";
import {
    getBillingPlans,
    getBillingStatus,
    payOrder,
    subscribePlan,
    type BillingPlan,
    type BillingStatus,
} from "@/services/nova/api";
import { membershipPlans } from "@/lib/membership";
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
            await createProjectSmart(t(tmpl.titleKey), tmpl.scene);
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
    const { t, i18n } = useTranslation();
    const isZh = i18n.language?.startsWith("zh");
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [loading, setLoading] = useState(false);
    const [subscribing, setSubscribing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [st, pl] = await Promise.all([
                getBillingStatus().catch(() => null),
                getBillingPlans().catch(() => []),
            ]);
            setStatus(st);
            setPlans(pl);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    const handleSubscribe = async (planId: string) => {
        setSubscribing(planId);
        try {
            const { order, pay_url } = await subscribePlan(planId, "monthly");
            if (order.status === "paid") {
                message.success(t("membership.subscribeSuccess"));
            } else if (pay_url) {
                // 演示：直接调 webhook 标记支付成功
                await payOrder(order.order_id, "paid");
                message.success(t("membership.subscribeSuccess"));
            }
            await refresh();
        } catch (e) {
            message.error(e instanceof Error ? e.message : t("membership.subscribeFailed"));
        } finally {
            setSubscribing(null);
        }
    };

    const currentPlanId = status?.plan_id;

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={760} centered>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-base font-semibold">{t("membership.title")}</h3>
                {status && (
                    <span className="text-xs text-muted-foreground">
                        {t("membership.currentPlan")}: {isZh ? status.plan_name_cn : status.plan_id}
                    </span>
                )}
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mr-2" />
                    {t("membership.loading")}
                </div>
            ) : error ? (
                <div className="py-12 text-center text-sm text-red-500">
                    {error}
                    <Button size="small" className="ml-3" onClick={refresh}>{t("membership.retry")}</Button>
                </div>
            ) : (
                <div className="grid gap-3 p-1 sm:grid-cols-3">
                    {(plans.length > 0 ? plans : membershipPlans.map((p) => ({
                        id: p.id,
                        name_cn: t(p.nameKey),
                        name_en: t(p.nameKey),
                        price_cny_month: p.id === "pro" ? 9900 : p.id === "team" ? 29900 : 0,
                        price_cny_year: 0,
                        features_cn: p.featuresKey.map((k) => t(k)),
                        features_en: p.featuresKey.map((k) => t(k)),
                        highlight: p.highlight,
                    }))).map((plan) => {
                        const isCurrent = plan.id === currentPlanId;
                        const priceLabel = plan.price_cny_month === 0
                            ? t("membership.plan.free.price")
                            : `¥${(plan.price_cny_month / 100).toFixed(0)} / ${t("membership.perMonth")}`;
                        return (
                            <div
                                key={plan.id}
                                className={`rounded-2xl border p-4 ${plan.highlight ? "border-black/60 dark:border-white/60" : "border-black/10 dark:border-white/10"}`}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold">{isZh ? plan.name_cn : plan.name_en}</h3>
                                    {isCurrent && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                            {t("membership.current")}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm text-black/60 dark:text-white/60">{priceLabel}</p>
                                <ul className="mt-3 space-y-1.5 text-xs">
                                    {(isZh ? plan.features_cn : plan.features_en).map((f, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <Check className="mt-0.5 size-3.5 shrink-0" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    type={plan.highlight ? "primary" : "default"}
                                    block
                                    className="mt-4"
                                    disabled={isCurrent || subscribing !== null}
                                    loading={subscribing === plan.id}
                                    onClick={() => handleSubscribe(plan.id)}
                                >
                                    {isCurrent ? t("membership.currentCta") : t("membership.cta")}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
