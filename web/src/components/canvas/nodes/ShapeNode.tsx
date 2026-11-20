import type { CanvasNodeData } from "@/types/canvas";

import { getShapeGeometry, resolveShapeStyle } from "./shape-geometry";

type ShapeNodeProps = {
    node: CanvasNodeData;
};

export function ShapeNodeRenderer({ node }: ShapeNodeProps) {
    const style = resolveShapeStyle(node.metadata);
    const geometry = getShapeGeometry(node.type, node.width, node.height, node.metadata);
    const common = {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeLinejoin: "round" as const,
    };

    return (
        <svg
            className="pointer-events-none block h-full w-full overflow-visible"
            viewBox={`0 0 ${node.width} ${node.height}`}
            preserveAspectRatio="none"
            data-shape-kind={geometry.kind}
            data-shape-width={node.width}
            data-shape-height={node.height}
            aria-hidden="true"
        >
            {geometry.kind === "rect" ? (
                <rect data-shape-part="outline" x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} rx={geometry.rx} {...common} />
            ) : (
                <ellipse data-shape-part="outline" cx={geometry.cx} cy={geometry.cy} rx={geometry.rx} ry={geometry.ry} {...common} />
            )}
        </svg>
    );
}
