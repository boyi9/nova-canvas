import { Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { CanvasErrorBoundary, NovaWorkbenchErrorBoundary } from "@/components/common/ErrorBoundary";
import { RouteErrorPage } from "@/components/common/RouteErrorPage";
import UserLayout from "@/layouts/user-layout";
import {
    AssetsPage,
    CanvasPage,
    CanvasProjectPage,
    CmdHubPage,
    ConfigPage,
    ControlPage,
    HomePage,
    ImagePage,
    LoginPage,
    NotFound,
    NovaHomePage,
    OnboardingPage,
    PromptsPage,
    SourcePreviewPage,
    StatusPage,
    TimelinePage,
    VideoPage,
} from "@/router/lazy-pages";
import { ROUTES } from "@/router/routes";

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

// 无主壳页面：登录、引导与异常状态页不渲染 UserLayout（顶栏 + Agent 面板）。
const SHELL_FREE_ROUTES: Array<{ path: string; element: React.ReactNode }> = [
    { path: ROUTES.login, element: <LoginPage /> },
    { path: ROUTES.onboarding, element: <OnboardingPage /> },
    { path: ROUTES.forbidden, element: <StatusPage kind="forbidden" /> },
    { path: ROUTES.empty, element: <StatusPage kind="empty" /> },
    { path: ROUTES.loading, element: <StatusPage kind="loading" /> },
    { path: ROUTES.maintenance, element: <StatusPage kind="maintenance" /> },
    { path: ROUTES.networkError, element: <StatusPage kind="networkError" /> },
    { path: ROUTES.insufficientCredits, element: <StatusPage kind="insufficientCredits" /> },
];

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
    ...SHELL_FREE_ROUTES.map(({ path, element }) => ({
        path,
        element: <LazyPage>{element}</LazyPage>,
        errorElement: <RouteErrorPage />,
    })),
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
