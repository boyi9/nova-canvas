import { Film, FileText, Gauge, ImagePlus, Images, Layers, Maximize2, Settings2, Terminal, Video } from "lucide-react";

import { ROUTES } from "@/router/routes";

/**
 * 侧边栏、移动端抽屉、命令面板共用的导航单一事实来源。
 *
 * path 一律取自 ROUTES，不允许在组件里用 slug 拼接路径：
 * slug 是 i18n key（如 source-preview），路由常量 key 可能不同（sourcePreview）。
 */
export const navigationTools = [
    {
        slug: "canvas",
        path: ROUTES.canvas,
        icon: Maximize2,
        group: "create",
    },
    {
        slug: "image",
        path: ROUTES.image,
        icon: ImagePlus,
        group: "create",
    },
    {
        slug: "video",
        path: ROUTES.video,
        icon: Video,
        group: "create",
    },
    {
        slug: "prompts",
        path: ROUTES.prompts,
        icon: FileText,
        group: "create",
    },
    {
        slug: "cmdhub",
        path: ROUTES.cmdhub,
        icon: Terminal,
        group: "tools",
    },
    {
        slug: "timeline",
        path: ROUTES.timeline,
        icon: Film,
        group: "tools",
    },
    {
        slug: "source-preview",
        path: ROUTES.sourcePreview,
        icon: Layers,
        group: "tools",
    },
    {
        slug: "assets",
        path: ROUTES.assets,
        icon: Images,
        group: "tools",
    },
    {
        slug: "control",
        path: ROUTES.control,
        icon: Gauge,
        group: "system",
    },
    {
        slug: "config",
        path: ROUTES.config,
        icon: Settings2,
        group: "system",
    },
] as const;

export type NavigationTool = (typeof navigationTools)[number];
export type NavigationToolSlug = NavigationTool["slug"];
export type NavigationGroupId = NavigationTool["group"];

export const navigationGroupOrder: readonly NavigationGroupId[] = ["create", "tools", "system"];

export function toolsByGroup(group: NavigationGroupId) {
    return navigationTools.filter((tool) => tool.group === group);
}

/**
 * 根据 pathname 解析当前激活的导航项。
 * 只比较首段路径，因此 /canvas/:id 会归入 canvas，而 /source-preview 不会被 /source 误判。
 */
export function navigationToolFromPath(pathname: string): NavigationTool | undefined {
    const [segment] = pathname.split("/").filter(Boolean);
    if (!segment) return undefined;
    return navigationTools.find((tool) => tool.path === `/${segment}`);
}
