import { describe, it, expect } from "vitest";
import { compileJianYingDraft } from "./video-draft-compiler";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

function makeNode(id: string, type: CanvasNodeType, title: string, metadata: Partial<CanvasNodeMetadata> = {}): CanvasNodeData {
    return { id, type, title, position: { x: 0, y: 0 }, width: 200, height: 120, metadata: metadata as CanvasNodeMetadata };
}

describe("compileJianYingDraft", () => {
    it("produces a draft with video/text materials and tracks", () => {
        const video = makeNode("v1", CanvasNodeType.Video, "片段1", { durationMs: 2000 });
        const text = makeNode("t1", CanvasNodeType.Text, "标题", { content: "促销文案" });
        const { content, meta, assets } = compileJianYingDraft([video, text], [], "测试工程");
        expect(content.name).toBe("测试工程");
        expect((content.materials as { videos: unknown[] }).videos).toHaveLength(1);
        expect((content.materials as { texts: unknown[] }).texts).toHaveLength(1);
        expect((content.tracks as unknown[]).length).toBeGreaterThanOrEqual(2);
        expect(assets.find((asset) => asset.nodeId === "v1")?.fileName).toBe("assets/v1.mp4");
        expect(meta.draft_name).toBe("测试工程");
    });

    it("groups clips under a connected VideoTrack node", () => {
        const track = makeNode("tr", CanvasNodeType.VideoTrack, "主轨道", {});
        const video = makeNode("v1", CanvasNodeType.Video, "片段", {});
        const connections: CanvasConnection[] = [{ id: "c1", fromNodeId: "tr", toNodeId: "v1" }];
        const { content } = compileJianYingDraft([track, video], connections, "x");
        const videoTracks = (content.tracks as { type: string }[]).filter((trackItem) => trackItem.type === "video");
        expect(videoTracks.length).toBeGreaterThanOrEqual(1);
    });

    it("falls back to a single video track when no VideoTrack node exists", () => {
        const video = makeNode("v1", CanvasNodeType.Video, "片段", {});
        const image = makeNode("i1", CanvasNodeType.Image, "图", {});
        const { content } = compileJianYingDraft([video, image], [], "x");
        const segments = (content.tracks as { type: string; segments: unknown[] }[]).filter((trackItem) => trackItem.type === "video").flatMap((trackItem) => trackItem.segments);
        expect(segments.length).toBe(2);
    });
});
