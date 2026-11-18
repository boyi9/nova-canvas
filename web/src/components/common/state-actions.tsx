import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type ActionVariant = "primary" | "secondary";

const ACTION_BASE = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const ACTION_VARIANTS: Record<ActionVariant, string> = {
    primary: "state-action-primary",
    secondary: "border border-border bg-background text-foreground hover:bg-muted",
};

/** 状态页主操作：站内跳转。 */
export function StatePrimaryLink({ to, children }: { to: string; children: ReactNode }) {
    return (
        <Link to={to} className={cn(ACTION_BASE, ACTION_VARIANTS.primary)}>
            {children}
        </Link>
    );
}

/** 状态页次要操作：站内跳转。 */
export function StateSecondaryLink({ to, children }: { to: string; children: ReactNode }) {
    return (
        <Link to={to} className={cn(ACTION_BASE, ACTION_VARIANTS.secondary)}>
            {children}
        </Link>
    );
}

/** 状态页操作按钮：刷新、重试等无跳转行为的动作。 */
export function StateActionButton({ children, onClick, variant = "secondary" }: { children: ReactNode; onClick: () => void; variant?: ActionVariant }) {
    return (
        <button type="button" onClick={onClick} className={cn(ACTION_BASE, ACTION_VARIANTS[variant])}>
            {children}
        </button>
    );
}
