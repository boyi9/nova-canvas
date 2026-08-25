import { CanvasConnection, CanvasNodeData, CanvasNodeType } from "@/types/canvas";
import { normalizeConnection } from "@/lib/canvas/canvas-node-geometry";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeSearchableText(node: CanvasNodeData): string {
    const metadata = node.metadata;
    if (!metadata) return "";
    return [metadata.prompt, metadata.composerContent, metadata.content]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join("\n");
}

/**
 * Detect semantic references between canvas nodes and return the connections
 * that should exist but are missing. References are discovered from:
 *  - explicit "@Title" mentions in a node's prompt/content,
 *  - unique node-title substrings appearing in another node's text,
 *  - scenario node wiring (Product→Storyboard, Storyboard→VideoTrack, node→Recipe).
 */
export function analyzeAutoLinks(nodes: CanvasNodeData[], existing: CanvasConnection[]): CanvasConnection[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const titleToIds = new Map<string, string[]>();
    for (const node of nodes) {
        const key = node.title.trim().toLowerCase();
        if (!key) continue;
        const list = titleToIds.get(key);
        if (list) list.push(node.id);
        else titleToIds.set(key, [node.id]);
    }
    const isUniqueTitle = (title: string) => {
        const list = titleToIds.get(title.trim().toLowerCase());
        return !!list && list.length === 1;
    };
    const existingKeys = new Set(existing.map((connection) => `${connection.fromNodeId}->${connection.toNodeId}`));
    const result: CanvasConnection[] = [];
    const seen = new Set<string>();

    const tryAdd = (fromId: string, toId: string): boolean => {
        if (fromId === toId) return false;
        const fromNode = byId.get(fromId);
        const toNode = byId.get(toId);
        if (!fromNode || !toNode) return false;
        if (fromNode.type === CanvasNodeType.Config) return false;
        const normalized = normalizeConnection(fromId, toId, nodes, "source");
        if (!normalized) return false;
        const key = `${normalized.fromNodeId}->${normalized.toNodeId}`;
        if (existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        result.push({ id: `autolink-${normalized.fromNodeId}-${normalized.toNodeId}-${result.length}`, ...normalized });
        return true;
    };

    // 1) Explicit "@Title" mentions.
    for (const target of nodes) {
        const text = nodeSearchableText(target);
        if (!text) continue;
        for (const source of nodes) {
            if (source.id === target.id) continue;
            const title = source.title.trim();
            if (!title) continue;
            if (new RegExp(`@${escapeRegExp(title)}(?![\\p{L}\\p{N}])`, "u").test(text)) tryAdd(source.id, target.id);
        }
    }

    // 2) Loose unique-title substring matches.
    for (const target of nodes) {
        const text = nodeSearchableText(target).toLowerCase();
        if (!text) continue;
        for (const source of nodes) {
            if (source.id === target.id) continue;
            const title = source.title.trim();
            if (title.length < 2 || !isUniqueTitle(title)) continue;
            if (text.includes(title.toLowerCase())) tryAdd(source.id, target.id);
        }
    }

    // 3) Scenario node wiring by exact title/product-name equality.
    for (const node of nodes) {
        const metadata = node.metadata;
        if (!metadata) continue;
        if (node.type === CanvasNodeType.Recipe && metadata.params) {
            for (const value of Object.values(metadata.params)) {
                if (typeof value !== "string") continue;
                const matches = titleToIds.get(value.trim().toLowerCase());
                if (matches) for (const id of matches) tryAdd(id, node.id);
            }
        }
        if (node.type === CanvasNodeType.Storyboard) {
            for (const other of nodes) {
                if (other.type !== CanvasNodeType.Product) continue;
                const productName = other.metadata?.productName?.trim();
                if (productName === node.title.trim() || other.title.trim() === node.title.trim()) tryAdd(other.id, node.id);
            }
        }
        if (node.type === CanvasNodeType.VideoTrack) {
            for (const other of nodes) {
                if (other.type !== CanvasNodeType.Storyboard) continue;
                if (other.title.trim() === node.title.trim()) tryAdd(other.id, node.id);
            }
        }
    }

    return result;
}
