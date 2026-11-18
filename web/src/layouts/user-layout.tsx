import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { isCanvasProjectPath } from "@/router/routes";

/**
 * 工作台主壳：左侧导航 + 顶栏 + 内容区 + Agent 面板。
 * 画布项目详情（/canvas/:id）隐藏左侧导航与顶栏，避免压缩画布工作区。
 */
export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const immersive = isCanvasProjectPath(pathname);

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            {immersive ? null : <AppSidebar />}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <AgentPanel />
        </div>
    );
}
