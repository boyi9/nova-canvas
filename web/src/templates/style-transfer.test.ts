import { beforeEach, describe, expect, it, vi } from "vitest";

import { transferImageStyle, transferVideoStyle, type StyleTransferConfig } from "./style-transfer";

vi.mock("@/services/nova/api", () => ({
    styleTransfer: vi.fn(),
    getGenerationStatus: vi.fn(),
}));

import { getGenerationStatus, styleTransfer } from "@/services/nova/api";

const config: StyleTransferConfig = {
    id: "style-watercolor",
    name: "水彩风格",
    type: "image",
    style: "watercolor",
    description: "",
    prompt: "Watercolor, {content}",
    parameters: { strength: 0.7, fidelity: 0.8, steps: 30 },
};

describe("transferImageStyle", () => {
    beforeEach(() => vi.clearAllMocks());

    it("calls the style-transfer endpoint then polls for the result url", async () => {
        vi.mocked(styleTransfer).mockResolvedValue({ task_id: "t1", status: "pending", credits: 1 });
        vi.mocked(getGenerationStatus).mockResolvedValue({ task_id: "t1", type: "image", status: "success", result_url: "https://cdn/x.jpg" });
        const res = await transferImageStyle("https://src/a.png", config);
        expect(styleTransfer).toHaveBeenCalledWith("https://src/a.png", "watercolor", 0.7);
        expect(res.success).toBe(true);
        expect(res.resultUrl).toBe("https://cdn/x.jpg");
    });

    it("propagates the backend error when the task fails", async () => {
        vi.mocked(styleTransfer).mockResolvedValue({ task_id: "t2", status: "pending", credits: 1 });
        vi.mocked(getGenerationStatus).mockResolvedValue({ task_id: "t2", type: "image", status: "failed", error: "boom" });
        const res = await transferImageStyle("https://src/a.png", config);
        expect(res.success).toBe(false);
        expect(res.error).toBe("boom");
    });
});

describe("transferVideoStyle", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reuses the same async pipeline for video", async () => {
        vi.mocked(styleTransfer).mockResolvedValue({ task_id: "v1", status: "pending", credits: 2 });
        vi.mocked(getGenerationStatus).mockResolvedValue({ task_id: "v1", type: "video", status: "success", result_url: "https://cdn/v.mp4" });
        const res = await transferVideoStyle("https://src/a.mp4", config);
        expect(styleTransfer).toHaveBeenCalledWith("https://src/a.mp4", "watercolor", 0.7);
        expect(res.resultUrl).toBe("https://cdn/v.mp4");
    });
});
