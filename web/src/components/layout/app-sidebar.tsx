import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationGroupOrder, navigationToolFromPath, toolsByGroup } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useNavStore } from "@/stores/use-nav-store";

/**
 * 工作台左侧导航。
 * 桌面端常驻，移动端由 AppTopNav 的抽屉承载；折叠状态持久化在 useNavStore。
 */
export function AppSidebar() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const collapsed = useNavStore((state) => state.sidebarCollapsed);
    const toggleSidebar = useNavStore((state) => state.toggleSidebar);
    const activeTool = navigationToolFromPath(pathname);
    const toggleLabel = t(collapsed ? "sidebar.expand" : "sidebar.collapse");

    return (
        <aside
            className={cn("hidden h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex", collapsed ? "w-16" : "w-60")}
            aria-label={t("topNav.navigation")}
            data-testid="app-sidebar"
            data-collapsed={collapsed ? "true" : undefined}
        >
            <div className={cn("flex h-14 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "px-4")}>
                <Link to="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-foreground transition hover:text-muted-foreground" title={t("meta.title")} aria-label={t("meta.title")}>
                    <span
                        className="size-5 shrink-0 bg-current"
                        style={{
                            mask: "url(/logo.svg) center / contain no-repeat",
                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                        }}
                    />
                    {!collapsed && <span className="truncate text-base font-medium">{t("meta.title")}</span>}
                </Link>
            </div>

            <nav className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3">
                {navigationGroupOrder.map((groupId) => (
                    <div key={groupId} className="space-y-1">
                        {collapsed ? <span aria-hidden className="mx-auto mb-2 block h-px w-6 bg-border" /> : <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`navGroup.${groupId}`)}</p>}
                        {toolsByGroup(groupId).map((tool) => {
                            const Icon = tool.icon;
                            const active = tool.slug === activeTool?.slug;
                            const label = t(`navigation.${tool.slug}`);
                            return (
                                <Link
                                    key={tool.slug}
                                    to={tool.path}
                                    aria-current={active ? "page" : undefined}
                                    aria-label={collapsed ? label : undefined}
                                    title={collapsed ? label : undefined}
                                    className={cn(
                                        "relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors",
                                        collapsed ? "justify-center px-0" : "px-2",
                                        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                    )}
                                >
                                    {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" /> : null}
                                    <Icon className="size-4 shrink-0" />
                                    {!collapsed && <span className="truncate">{label}</span>}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="shrink-0 border-t border-border p-2">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                    title={toggleLabel}
                    className={cn("flex h-9 w-full items-center gap-3 rounded-md text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed ? "justify-center px-0" : "px-2")}
                >
                    {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
                    {!collapsed && <span className="truncate">{t("sidebar.collapse")}</span>}
                </button>
            </div>
        </aside>
    );
}
