import { Film, FileText, Gauge, ImagePlus, Images, Layers, Maximize2, Settings2, Terminal, Video } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
        group: "create",
    },
    {
        slug: "image",
        icon: ImagePlus,
        group: "create",
    },
    {
        slug: "video",
        icon: Video,
        group: "create",
    },
    {
        slug: "prompts",
        icon: FileText,
        group: "create",
    },
    {
        slug: "cmdhub",
        icon: Terminal,
        group: "tools",
    },
    {
        slug: "timeline",
        icon: Film,
        group: "tools",
    },
    {
        slug: "source-preview",
        icon: Layers,
        group: "tools",
    },
    {
        slug: "assets",
        icon: Images,
        group: "tools",
    },
    {
        slug: "control",
        icon: Gauge,
        group: "system",
    },
    {
        slug: "config",
        icon: Settings2,
        group: "system",
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
export type NavigationGroupId = (typeof navigationTools)[number]["group"];

export const navigationGroupOrder: readonly NavigationGroupId[] = ["create", "tools", "system"];

export function toolsByGroup(group: NavigationGroupId) {
    return navigationTools.filter((tool) => tool.group === group);
}
