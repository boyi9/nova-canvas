import { lazy } from "react";

/**
 * 路由级懒加载页面清单。
 *
 * 集中放在 .ts 文件中，router.tsx 只保留路由表结构：
 * 页面一律默认导出，新增页面时在此登记再挂到路由上。
 */
export const NovaHomePage = lazy(() => import("@/pages/nova"));
export const HomePage = lazy(() => import("@/pages/home"));
export const ImagePage = lazy(() => import("@/pages/image"));
export const VideoPage = lazy(() => import("@/pages/video"));
export const AssetsPage = lazy(() => import("@/pages/assets"));
export const PromptsPage = lazy(() => import("@/pages/prompts"));
export const CanvasPage = lazy(() => import("@/pages/canvas"));
export const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
export const ConfigPage = lazy(() => import("@/pages/config"));
export const CmdHubPage = lazy(() => import("@/pages/cmdhub"));
export const TimelinePage = lazy(() => import("@/pages/timeline"));
export const SourcePreviewPage = lazy(() => import("@/pages/source-preview"));
export const ControlPage = lazy(() => import("@/pages/control"));
export const NotFound = lazy(() => import("@/pages/not-found"));
export const LoginPage = lazy(() => import("@/pages/login"));
export const OnboardingPage = lazy(() => import("@/pages/onboarding"));
export const StatusPage = lazy(() => import("@/pages/status"));
