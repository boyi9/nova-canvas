import type { LucideIcon } from "lucide-react";
import { CreditCard, Inbox, Loader2, RefreshCw, ShieldOff, WifiOff, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StateActionButton, StatePrimaryLink, StateSecondaryLink } from "@/components/common/state-actions";
import { StatePage } from "@/components/common/state-page";
import { ROUTES } from "@/router/routes";

type StatusKind = "forbidden" | "empty" | "loading" | "maintenance" | "networkError" | "insufficientCredits";

const STATUS_ICONS: Record<StatusKind, LucideIcon> = {
    forbidden: ShieldOff,
    empty: Inbox,
    loading: Loader2,
    maintenance: Wrench,
    networkError: WifiOff,
    insufficientCredits: CreditCard,
};

const STATUS_CODES: Partial<Record<StatusKind, string>> = {
    forbidden: "403",
    maintenance: "503",
    insufficientCredits: "402",
};

const STATUS_TONES: Record<StatusKind, "neutral" | "brand" | "warning" | "danger"> = {
    forbidden: "danger",
    empty: "neutral",
    loading: "brand",
    maintenance: "warning",
    networkError: "warning",
    insufficientCredits: "warning",
};

interface StatusPageProps {
    kind: StatusKind;
}

/**
 * 异常状态页集合：/403、/empty、/loading、/maintenance、/network-error、/insufficient-credits。
 *
 * 一个组件承载多个状态，避免 6 份几乎相同的 JSX；路由处通过 kind 传入状态，
 * 打包后仍按路由懒加载。404 由 catch-all 路由交给 not-found 页面。
 */
export default function StatusPage({ kind }: StatusPageProps) {
    const { t } = useTranslation();
    const reload = () => window.location.reload();

    const renderActions = () => {
        switch (kind) {
            case "forbidden":
                return (
                    <>
                        <StatePrimaryLink to={ROUTES.nova}>{t("stateActions.backHome")}</StatePrimaryLink>
                        <StateSecondaryLink to={ROUTES.login}>{t("stateActions.login")}</StateSecondaryLink>
                    </>
                );
            case "empty":
                return <StatePrimaryLink to={ROUTES.nova}>{t("stateActions.create")}</StatePrimaryLink>;
            case "loading":
                return <StateActionButton onClick={reload}>{t("stateActions.reload")}</StateActionButton>;
            case "maintenance":
                return (
                    <>
                        <StateActionButton onClick={reload} variant="primary">
                            <RefreshCw className="size-4" />
                            {t("stateActions.reload")}
                        </StateActionButton>
                        <StateSecondaryLink to={ROUTES.nova}>{t("stateActions.backHome")}</StateSecondaryLink>
                    </>
                );
            case "networkError":
                return (
                    <>
                        <StateActionButton onClick={reload} variant="primary">
                            <RefreshCw className="size-4" />
                            {t("stateActions.retry")}
                        </StateActionButton>
                        <StateSecondaryLink to={ROUTES.nova}>{t("stateActions.backHome")}</StateSecondaryLink>
                    </>
                );
            case "insufficientCredits":
                return (
                    <>
                        <StatePrimaryLink to={ROUTES.novaWorkbench}>{t("stateActions.backWorkbench")}</StatePrimaryLink>
                        <StateSecondaryLink to={ROUTES.login}>{t("stateActions.login")}</StateSecondaryLink>
                    </>
                );
        }
    };

    return (
        <StatePage
            icon={STATUS_ICONS[kind]}
            code={STATUS_CODES[kind]}
            tone={STATUS_TONES[kind]}
            loading={kind === "loading"}
            title={t(`statusPages.${kind}.title`)}
            description={t(`statusPages.${kind}.description`)}
            actions={renderActions()}
            footnote={kind === "loading" || kind === "insufficientCredits" ? t(`statusPages.${kind}.footnote`) : undefined}
        />
    );
}
