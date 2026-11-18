import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatePageTone = "neutral" | "brand" | "warning" | "danger";

const TONE_CLASSES: Record<StatePageTone, string> = {
    neutral: "border-border bg-white text-foreground shadow-sm dark:border-border dark:bg-card dark:text-foreground",
    brand: "border-brand/25 bg-brand-light text-brand-dark dark:border-brand/40 dark:bg-brand/10 dark:text-brand",
    warning: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
    danger: "border-red-500/25 bg-red-50 text-red-600 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300",
};

interface StatePageProps {
    icon?: LucideIcon;
    /** 语义化状态码，如 403 / 503；纯展示，不参与路由判断。 */
    code?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    footnote?: ReactNode;
    tone?: StatePageTone;
    /** 加载态：用旋转图标替代状态图标，适合路由级 Suspense 或异步占位。 */
    loading?: boolean;
}

/**
 * 通用状态页骨架。
 *
 * 7 个异常状态页（404/空/加载/无权限/维护/网络错误/额度不足）共用同一视觉结构，
 * 只通过 icon/tone/actions 区分，避免每个页面重复排版代码。
 * 页面级路由元素因此可以保持全屏，不用套 UserLayout。
 */
export function StatePage({ icon: Icon, code, title, description, actions, footnote, tone = "neutral", loading = false }: StatePageProps) {
    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <main className="flex flex-1 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-16 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <section className="w-full max-w-lg text-center">
                    <div className={cn("mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border", TONE_CLASSES[tone])} aria-hidden>
                        {loading ? <Loader2 className="size-7 animate-spin" /> : Icon ? <Icon className="size-7" /> : null}
                    </div>
                    {code ? <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground">{code}</p> : null}
                    <h1 className="mt-2 text-3xl font-semibold tracking-normal" aria-live={loading ? "polite" : undefined}>
                        {title}
                    </h1>
                    {description ? <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
                    {actions ? <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
                    {footnote ? <div className="mt-8 text-xs leading-5 text-muted-foreground">{footnote}</div> : null}
                </section>
            </main>
        </div>
    );
}
