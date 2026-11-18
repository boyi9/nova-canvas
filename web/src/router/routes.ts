/**
 * 前端路由单一事实来源。
 *
 * 路由路径不得在页面/组件中硬编码：静态路径从 ROUTES 取，带参数路径用 helper 生成。
 * 新增页面时同步更新此文件与 router.tsx（routes.test.ts 会校验路径唯一性）。
 */

export const ROUTES = {
    nova: "/",
    home: "/home",
    novaWorkbench: "/nova",
    image: "/image",
    video: "/video",
    assets: "/assets",
    prompts: "/prompts",
    canvas: "/canvas",
    canvasProject: "/canvas/:id",
    cmdhub: "/cmdhub",
    timeline: "/timeline",
    sourcePreview: "/source-preview",
    control: "/control",
    config: "/config",
} as const;

export type AppRouteId = keyof typeof ROUTES;
export type AppRoutePath = (typeof ROUTES)[AppRouteId];

/** 生成画布项目详情路径（对 id 做 URL 编码，避免拼接注入）。 */
export function canvasProjectPath(id: string): string {
    return `/canvas/${encodeURIComponent(id)}`;
}

/** 所有静态路由模板（用于校验唯一性/生成导航）。 */
export const ROUTE_PATHS: readonly AppRoutePath[] = Object.values(ROUTES);
