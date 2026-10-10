import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CornerDownLeft, Search } from "lucide-react";

import { navigationGroupOrder, navigationTools } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return navigationTools;
        return navigationTools.filter((tool) => {
            const label = t(`navigation.${tool.slug}`).toLowerCase();
            return label.includes(q) || tool.slug.toLowerCase().includes(q);
        });
    }, [query, t]);

    const grouped = useMemo(
        () =>
            navigationGroupOrder
                .map((group) => ({ group, tools: items.filter((tool) => tool.group === group) }))
                .filter((entry) => entry.tools.length > 0),
        [items],
    );

    const flat = useMemo(() => grouped.flatMap((entry) => entry.tools), [grouped]);

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActiveIndex(0);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => (flat.length === 0 ? 0 : (index + 1) % flat.length));
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => (flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length));
            }
            if (event.key === "Enter") {
                const tool = flat[activeIndex];
                if (tool) {
                    event.preventDefault();
                    navigate(`/${tool.slug}`);
                    onClose();
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, flat, activeIndex, navigate, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label={t("commandPalette.title")}>
            <button type="button" className="absolute inset-0 bg-background/60 backdrop-blur-sm" aria-hidden onClick={onClose} />
            <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border px-4">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                        }}
                        placeholder={t("commandPalette.placeholder")}
                        className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        aria-label={t("commandPalette.search")}
                    />
                    <kbd className="pointer-events-none shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
                </div>
                <div className="max-h-80 overflow-y-auto py-2">
                    {flat.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("commandPalette.noResults")}</p>
                    ) : (
                        grouped.map(({ group, tools }) => (
                            <div key={group}>
                                <p className="px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">{t(`navGroup.${group}`)}</p>
                                {tools.map((tool) => {
                                    const Icon = tool.icon;
                                    const index = flat.indexOf(tool);
                                    const active = index === activeIndex;
                                    return (
                                        <button
                                            key={tool.slug}
                                            type="button"
                                            className={cn(
                                                "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                                                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
                                            )}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            onClick={() => {
                                                navigate(`/${tool.slug}`);
                                                onClose();
                                            }}
                                        >
                                            <Icon className="size-4 shrink-0" />
                                            <span className="flex-1 truncate">{t(`navigation.${tool.slug}`)}</span>
                                            <span className="text-xs text-muted-foreground">/{tool.slug}</span>
                                            {active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
                <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    <span>{t("commandPalette.hint")}</span>
                    <span>⌘K</span>
                </div>
            </div>
        </div>
    );
}
