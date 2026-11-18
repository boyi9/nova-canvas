import { Bot, Menu, Search } from "lucide-react";
import { Button, Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationToolFromPath } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { isCanvasProjectPath, ROUTES } from "@/router/routes";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";

/**
 * 工作台顶栏。
 * 导航项已移到左侧 AppSidebar，这里只保留当前页标题与全局操作；
 * /canvas/:id 为沉浸式路由，整条顶栏隐藏。
 */
export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const hideHeader = isCanvasProjectPath(pathname);
    const activeTool = navigationToolFromPath(pathname);
    const ActiveToolIcon = activeTool?.icon;
    const pageTitle = activeTool ? t(`navigation.${activeTool.slug}`) : t("meta.title");

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setPaletteOpen((open) => !open);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 backdrop-blur-xl md:px-6" data-testid="app-top-nav">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground md:hidden dark:text-muted-foreground dark:hover:text-white"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={t("topNav.openMenu")}
                            title={t("topNav.menu")}
                        >
                            <Menu className="size-5" />
                        </button>

                        <Link to={ROUTES.nova} className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-foreground transition hover:text-muted-foreground md:hidden">
                            <span
                                className="size-5 shrink-0 bg-current"
                                style={{
                                    mask: "url(/logo.svg) center / contain no-repeat",
                                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                }}
                            />
                            <span className="truncate text-base font-medium">{t("meta.title")}</span>
                        </Link>

                        <div className="hidden min-w-0 items-center gap-2 md:flex">
                            {ActiveToolIcon ? <ActiveToolIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
                            <h1 className="truncate text-sm font-medium text-foreground" aria-live="polite">
                                {pageTitle}
                            </h1>
                        </div>
                    </div>

                    <div className="flex h-9 min-w-0 shrink-0 items-center justify-end gap-2 whitespace-nowrap">
                        <Tooltip title={t("commandPalette.open")}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Search className="size-4" />} onClick={() => setPaletteOpen(true)} aria-label={t("commandPalette.open")} />
                        </Tooltip>
                        <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Bot className="size-4" />} onClick={togglePanel} aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")} />
                        </Tooltip>
                        <UserStatusActions />
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeTool?.slug} onClose={() => setMobileNavOpen(false)} />
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <AppConfigModal />
        </>
    );
}
