import { Suspense, lazy } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { CanvasErrorBoundary, NovaWorkbenchErrorBoundary } from "@/components/common/ErrorBoundary";
import { RouteErrorPage } from "@/components/common/RouteErrorPage";
import UserLayout from "@/layouts/user-layout";
import { ROUTES } from "@/router/routes";

// Lazy-loaded page components for code splitting.
// 约定：页面一律默认导出；路由路径只从 ROUTES 读取，禁止在组件中硬编码。
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
        // 路由级兜底：懒加载失败、布局异常时仍可导航回首页。
        errorElement: <RouteErrorPage />,
        children: [
            {
                path: ROUTES.nova,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <NovaHomePage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.home,
                element: (
                    <LazyPage>
                        <HomePage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.novaWorkbench,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <NovaHomePage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.image,
                element: (
                    <LazyPage>
                        <ImagePage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.video,
                element: (
                    <LazyPage>
                        <VideoPage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.assets,
                element: (
                    <LazyPage>
                        <AssetsPage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.prompts,
                element: (
                    <LazyPage>
                        <PromptsPage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.canvas,
                element: (
                    <LazyPage>
                        <CanvasPage />
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.canvasProject,
                element: (
                    <LazyPage>
                        <CanvasErrorBoundary>
                            <CanvasProjectPage />
                        </CanvasErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.cmdhub,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <CmdHubPage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.timeline,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <TimelinePage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.sourcePreview,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <SourcePreviewPage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.control,
                element: (
                    <LazyPage>
                        <NovaWorkbenchErrorBoundary>
                            <ControlPage />
                        </NovaWorkbenchErrorBoundary>
                    </LazyPage>
                ),
            },
            {
                path: ROUTES.config,
                element: (
                    <LazyPage>
                        <ConfigPage />
                    </LazyPage>
                ),
            },
        ],
    },
    {
        path: "*",
        element: (
            <LazyPage>
                <NotFound />
            </LazyPage>
        ),
        errorElement: <RouteErrorPage />,
    },
]);
