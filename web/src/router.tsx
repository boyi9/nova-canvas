import { Suspense, lazy } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { CanvasErrorBoundary, NovaWorkbenchErrorBoundary } from "@/components/common/ErrorBoundary";
import UserLayout from "@/layouts/user-layout";

// Lazy-loaded page components for code splitting
const NovaHomePage = lazy(() => import("@/pages/nova"));
const HomePage = lazy(() => import("@/pages/home"));
const ImagePage = lazy(() => import("@/pages/image"));
const VideoPage = lazy(() => import("@/pages/video"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
const CmdHubPage = lazy(() => import("@/pages/cmdhub"));
const TimelinePage = lazy(() => import("@/pages/timeline"));
const SourcePreviewPage = lazy(() => import("@/pages/source-preview"));
const ControlPage = lazy(() => import("@/pages/control"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
    return (
        <div className="flex h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="size-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
        </div>
    );
}

function LazyPage({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <LazyPage><NovaWorkbenchErrorBoundary><NovaHomePage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/home", element: <LazyPage><HomePage /></LazyPage> },
            { path: "/nova", element: <LazyPage><NovaWorkbenchErrorBoundary><NovaHomePage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/image", element: <LazyPage><ImagePage /></LazyPage> },
            { path: "/video", element: <LazyPage><VideoPage /></LazyPage> },
            { path: "/assets", element: <LazyPage><AssetsPage /></LazyPage> },
            { path: "/prompts", element: <LazyPage><PromptsPage /></LazyPage> },
            { path: "/canvas", element: <LazyPage><CanvasPage /></LazyPage> },
            { path: "/canvas/:id", element: <LazyPage><CanvasErrorBoundary><CanvasProjectPage /></CanvasErrorBoundary></LazyPage> },
            { path: "/cmdhub", element: <LazyPage><NovaWorkbenchErrorBoundary><CmdHubPage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/timeline", element: <LazyPage><NovaWorkbenchErrorBoundary><TimelinePage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/source-preview", element: <LazyPage><NovaWorkbenchErrorBoundary><SourcePreviewPage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/control", element: <LazyPage><NovaWorkbenchErrorBoundary><ControlPage /></NovaWorkbenchErrorBoundary></LazyPage> },
            { path: "/config", element: <LazyPage><ConfigPage /></LazyPage> },
        ],
    },
    { path: "*", element: <LazyPage><NotFound /></LazyPage> },
]);
