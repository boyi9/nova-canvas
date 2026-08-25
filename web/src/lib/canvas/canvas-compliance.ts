import { checkAdCompliance, type ComplianceCheckResult } from "@/compliance/ad-law-checker";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type NodeComplianceViolation = {
    field: string;
    keyword: string;
    category: string;
    suggestion: string;
};

export type NodeComplianceReport = {
    nodeId: string;
    title: string;
    type: string;
    violations: NodeComplianceViolation[];
    score: number;
};

export type CanvasComplianceReport = {
    nodes: NodeComplianceReport[];
    totalViolations: number;
    score: number;
};

function nodeTexts(node: CanvasNodeData): { field: string; text: string }[] {
    const metadata = node.metadata;
    const out: { field: string; text: string }[] = [];
    const push = (field: string, value?: string) => {
        if (value && value.trim()) out.push({ field, text: value });
    };
    push("title", node.title);
    push("prompt", metadata?.prompt);
    push("content", metadata?.content);
    push("composerContent", metadata?.composerContent);
    if (node.type === CanvasNodeType.Product) {
        push("productName", metadata?.productName);
        (metadata?.sellingPoints || []).forEach((point, index) => push(`sellingPoints[${index}]`, point));
    }
    if (node.type === CanvasNodeType.Storyboard) {
        (metadata?.scenes || []).forEach((scene, index) => push(`scenes[${index}]`, scene));
    }
    if (node.type === CanvasNodeType.Recipe) {
        push("recipeName", metadata?.recipeName);
        Object.entries(metadata?.params || {}).forEach(([key, value]) => push(`params.${key}`, typeof value === "string" ? value : undefined));
    }
    if (node.type === CanvasNodeType.VideoTrack) {
        (metadata?.clips || []).forEach((clip, index) => push(`clips[${index}]`, clip));
    }
    return out;
}

/**
 * Scan all canvas nodes for advertising-law compliance issues using the shared
 * `checkAdCompliance` analyzer. Returns a per-node report plus totals.
 */
export function scanCanvasCompliance(nodes: CanvasNodeData[]): CanvasComplianceReport {
    const reports: NodeComplianceReport[] = [];
    for (const node of nodes) {
        const violations: NodeComplianceViolation[] = [];
        for (const { field, text } of nodeTexts(node)) {
            const result: ComplianceCheckResult = checkAdCompliance(text);
            for (const violation of result.violations) {
                violations.push({
                    field,
                    keyword: violation.keyword,
                    category: violation.category,
                    suggestion: violation.suggestion,
                });
            }
        }
        if (violations.length) {
            reports.push({
                nodeId: node.id,
                title: node.title,
                type: node.type,
                violations,
                score: Math.max(0, 100 - violations.length * 10),
            });
        }
    }
    const totalViolations = reports.reduce((sum, report) => sum + report.violations.length, 0);
    return {
        nodes: reports,
        totalViolations,
        score: reports.length ? Math.max(0, 100 - totalViolations * 10) : 100,
    };
}
