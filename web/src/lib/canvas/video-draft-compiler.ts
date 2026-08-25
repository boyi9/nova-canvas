import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const US = 1_000_000; // JianYing timeranges are expressed in microseconds.

function uuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = (Math.random() * 16) | 0;
        const next = char === "x" ? value : (value & 0x3) | 0x8;
        return next.toString(16);
    });
}

function safeFileName(value: string): string {
    return (value || "nova-canvas").replace(/[\\/:*?"<>|]/g, "_");
}

function nodeDurationUs(node: CanvasNodeData): number {
    const ms = node.metadata?.durationMs;
    if (typeof ms === "number" && ms > 0) return ms * 1000;
    if (node.type === CanvasNodeType.Image) return 3 * US;
    if (node.type === CanvasNodeType.Audio) return 5 * US;
    return 5 * US;
}

function mediaExtension(node: CanvasNodeData): string {
    if (node.type === CanvasNodeType.Video) return "mp4";
    if (node.type === CanvasNodeType.Image) return "png";
    if (node.type === CanvasNodeType.Audio) return "mp3";
    return "bin";
}

type DraftAsset = { nodeId: string; fileName: string };

type CompiledDraft = {
    content: Record<string, unknown>;
    meta: Record<string, unknown>;
    assets: DraftAsset[];
};

function buildVideoMaterial(node: CanvasNodeData, materialId: string, path: string): Record<string, unknown> {
    return {
        audio_fade: { fade_in: 0, fade_out: 0 },
        beauty_finance: { enable_mouth_lift: false, lift: 0 },
        cartoon_path: "",
        check_flag: 0,
        crop: { lower_left_x: 0, lower_left_y: 0, lower_right_x: 0, lower_right_y: 0, upper_left_x: 0, upper_left_y: 0, upper_right_x: 0, upper_right_y: 0 },
        crop_ratio: "original",
        crop_settings: { crop_bottom: 0, crop_left: 0, crop_right: 0, crop_top: 0, enable: false, ratio: "original", scale: 1, source_dx: 0, source_dy: 0, target_dx: 0, target_dy: 0 },
        duration: nodeDurationUs(node),
        file_Path: path,
        id: materialId,
        intro_type: "",
        is_asset: false,
        is_copyright: false,
        is_dft: false,
        is_place_holder: false,
        is_tone_modify: false,
        local_id: materialId,
        material_id: materialId,
        music_id: "",
        path,
        picture_from: "",
        picture_scale: 1,
        source: 0,
        source_path: "",
        type: "video",
        video_fade: { fade_in: 0, fade_out: 0 },
        width: Math.round(node.width) || 1080,
        height: Math.round(node.height) || 1920,
        zoom: 1,
    };
}

function buildImageMaterial(node: CanvasNodeData, materialId: string, path: string): Record<string, unknown> {
    return {
        ...buildVideoMaterial(node, materialId, path),
        type: "image",
    };
}

function buildAudioMaterial(node: CanvasNodeData, materialId: string, path: string): Record<string, unknown> {
    return {
        audible: true,
        id: materialId,
        material_id: materialId,
        path,
        file_Path: path,
        duration: nodeDurationUs(node),
        music_id: "",
        resource_id: materialId,
        type: "audio",
        waveform: null,
        source: 0,
        is_asset: false,
        is_copyright: false,
        check_flag: 0,
        width: 0,
        height: 0,
        zoom: 1,
        local_id: materialId,
    };
}

function buildTextMaterial(node: CanvasNodeData, materialId: string): Record<string, unknown> {
    const content = node.metadata?.content || node.metadata?.prompt || node.title || "";
    return {
        id: materialId,
        material_id: materialId,
        content,
        type: "text",
        fonts: [],
        font_size: 40,
        text_color: "#FFFFFF",
        align: 1,
        background_color: "",
        border_color: "",
        border_width: 0,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        letter_spacing: 0,
        line_spacing: 1,
        source_from: "",
        source_platform: "",
        track_name: "文本",
        is_rich_text: false,
        rich_text: "",
        has_shadow: false,
        shadow: { color: "#000000", alpha: 0.5, blur: 4, distance: 4, direction: 315, enable: false },
        uses_dynamic_bg: false,
        dynamic_bg_id: "",
        dynamic_bg_scene_id: "",
    };
}

function buildClip(): Record<string, unknown> {
    return {
        alpha: 1,
        flip: { horizontal: false, vertical: false },
        rotation: 0,
        scale: { x: 1, y: 1 },
        transform: { x: 0, y: 0 },
        trunc: { lower: 0, upper: 0 },
    };
}

function buildSegment(materialId: string, startUs: number, durationUs: number, kind: "video" | "audio" | "text"): Record<string, unknown> {
    return {
        cartoon: false,
        clip: buildClip(),
        common_keyframes: [],
        enable_adjust: true,
        enable_color_curves: true,
        enable_color_match: true,
        enable_color_wheels: true,
        enable_lut: true,
        enable_smart_color_adjust: false,
        extra_material_refs: [],
        group_id: "",
        hdr_settings: { intensity: 1, mode: 0, nomal_mode: true },
        id: uuid(),
        intensifies_audio: false,
        is_placed: true,
        mask: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 }, type: "none" },
        material_id: materialId,
        render_index: 0,
        reverse: false,
        source_timerange: { start: 0, duration: durationUs },
        speed: 1,
        target_timerange: { start: startUs, duration: durationUs },
        template_id: "",
        template_scopes: [],
        track_move: { path: "", rate: 1 },
        type: kind === "text" ? "text" : kind === "audio" ? "audio" : "video",
        uni_online_material_ids: [],
        visible: true,
        volume: 1,
    };
}

function buildTrack(kind: "video" | "audio" | "text", segments: Record<string, unknown>[]): Record<string, unknown> {
    return {
        attribute: 0,
        flag: 0,
        id: uuid(),
        segments,
        type: kind,
        visible: true,
    };
}

function emptyMaterials(): Record<string, unknown[]> {
    return {
        ai_translates: [],
        audios: [],
        audio_balances: [],
        audio_fades: [],
        audio_track_masks: [],
        audio_transitions: [],
        beats: [],
        canvases: [],
        chroma_s: [],
        color_curves: [],
        color_wheels: [],
        complex_shapes: [],
        deformations: [],
        effects: [],
        flowers: [],
        green_screens: [],
        handwrites: [],
        images: [],
        image_erasers: [],
        local_magics: [],
        magics: [],
        manual_masks: [],
        matting: [],
        multi_language_refs: [],
        placeholders: [],
        plugin_effects: [],
        plugins: [],
        portrait_setups: [],
        realtime_separates: [],
        shapes: [],
        smart_crops: [],
        smart_segments: [],
        sound_effects: [],
        speeds: [],
        stickers: [],
        tail_leaders: [],
        text_templates: [],
        texts: [],
        transitions: [],
        video_masks: [],
        videos: [],
        vocal_separations: [],
    };
}

/**
 * Compile canvas nodes/connections into a JianYing (剪映) draft. The returned
 * `assets` list describes the media files that must be packaged next to the
 * draft JSON so the project can be imported. Media paths use a relative
 * `assets/<nodeId>.<ext>` layout that matches the exported zip structure.
 */
export function compileJianYingDraft(nodes: CanvasNodeData[], connections: CanvasConnection[], name: string): CompiledDraft {
    const now = Math.floor(Date.now() / 1000);
    const draftId = uuid();
    const safeName = (name || "NovaCanvas").trim() || "NovaCanvas";

    const isText = (type: string) => type === CanvasNodeType.Text || type === CanvasNodeType.NovaText;
    const videoNodes = nodes.filter((node) => node.type === CanvasNodeType.Video);
    const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
    const audioNodes = nodes.filter((node) => node.type === CanvasNodeType.Audio);
    const textNodes = nodes.filter((node) => isText(node.type));
    const videoTrackNodes = nodes.filter((node) => node.type === CanvasNodeType.VideoTrack);

    const assets: DraftAsset[] = [];
    const assetFileName = (node: CanvasNodeData) => {
        const fileName = `assets/${node.id}.${mediaExtension(node)}`;
        assets.push({ nodeId: node.id, fileName });
        return fileName;
    };

    const videoMaterials = new Map<string, Record<string, unknown>>();
    const imageMaterials = new Map<string, Record<string, unknown>>();
    const audioMaterials = new Map<string, Record<string, unknown>>();
    const textMaterials = new Map<string, Record<string, unknown>>();

    for (const node of videoNodes) {
        const id = uuid();
        videoMaterials.set(node.id, buildVideoMaterial(node, id, assetFileName(node)));
    }
    for (const node of imageNodes) {
        const id = uuid();
        imageMaterials.set(node.id, buildImageMaterial(node, id, assetFileName(node)));
    }
    for (const node of audioNodes) {
        const id = uuid();
        audioMaterials.set(node.id, buildAudioMaterial(node, id, assetFileName(node)));
    }
    for (const node of textNodes) {
        const id = uuid();
        textMaterials.set(node.id, buildTextMaterial(node, id));
    }

    const downstream = (id: string) =>
        connections
            .filter((connection) => connection.fromNodeId === id)
            .map((connection) => nodes.find((node) => node.id === connection.toNodeId))
            .filter((node): node is CanvasNodeData => Boolean(node));

    const layOutMedia = (media: CanvasNodeData[], kind: "video" | "audio"): Record<string, unknown>[] => {
        const sorted = [...media].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
        let cursor = 0;
        return sorted.map((node) => {
            const duration = nodeDurationUs(node);
            const materialId =
                videoMaterials.get(node.id)?.material_id ||
                imageMaterials.get(node.id)?.material_id ||
                audioMaterials.get(node.id)?.material_id;
            const segment = buildSegment(materialId as string, cursor, duration, kind);
            cursor += duration;
            return segment;
        });
    };

    const tracks: Record<string, unknown>[] = [];

    if (videoTrackNodes.length) {
        const covered = new Set<string>();
        for (const track of videoTrackNodes) {
            const media = downstream(track.id).filter((node) =>
                [CanvasNodeType.Video, CanvasNodeType.Image, CanvasNodeType.Audio, CanvasNodeType.Text, CanvasNodeType.NovaText].includes(node.type as CanvasNodeType),
            );
            media.forEach((node) => covered.add(node.id));
            if (!media.length) continue;
            const videoSegments = layOutMedia(media.filter((node) => node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Image), "video");
            const audioSegments = layOutMedia(media.filter((node) => node.type === CanvasNodeType.Audio), "audio");
            const textSegments = layOutMedia(media.filter((node) => isText(node.type)), "text");
            if (videoSegments.length) tracks.push(buildTrack("video", videoSegments));
            if (audioSegments.length) tracks.push(buildTrack("audio", audioSegments));
            if (textSegments.length) tracks.push(buildTrack("text", textSegments));
        }
        const remaining = [...videoNodes, ...imageNodes].filter((node) => !covered.has(node.id));
        if (remaining.length) tracks.push(buildTrack("video", layOutMedia(remaining, "video")));
        const remainingAudio = audioNodes.filter((node) => !covered.has(node.id));
        if (remainingAudio.length) tracks.push(buildTrack("audio", layOutMedia(remainingAudio, "audio")));
    } else {
        if (videoNodes.length || imageNodes.length) tracks.push(buildTrack("video", layOutMedia([...videoNodes, ...imageNodes], "video")));
        if (audioNodes.length) tracks.push(buildTrack("audio", layOutMedia(audioNodes, "audio")));
    }
    if (textNodes.length) tracks.push(buildTrack("text", layOutMedia(textNodes, "text")));

    const materials = emptyMaterials();
    materials.videos = [...videoMaterials.values()];
    materials.images = [...imageMaterials.values()];
    materials.audios = [...audioMaterials.values()];
    materials.texts = [...textMaterials.values()];

    const content: Record<string, unknown> = {
        app_version: "5.0.0",
        aspect_ratio: { ratio: 0.5625 },
        canvas_config: {
            blend_mode: "",
            border_alpha: 1,
            border_color: "",
            border_width: 0,
            flip: { horizontal: false, vertical: false },
            round_radius: 0,
            scale: { x: 1, y: 1 },
            transform: { x: 0, y: 0 },
        },
        color_space: 0,
        config: { adjust_max_size: 0, adjust_prefer_slice: false, adjust_prefer_slice_size: 0, concat_max_count: 0, concat_overlap: 0 },
        create_time: now,
        draft_id: draftId,
        extra_info: { app_id: "nova-canvas", app_version: "5.0.0", platform: "windows" },
        fps: 30,
        groups: [],
        id: draftId,
        keyframes: { adjust: [], color: [], effect: [], filter: [], mask: [], picture: [], speed: [], stickers: [], video: [] },
        last_update_time: now,
        materials,
        mutable_config: {
            audio_follow: false,
            audio_split: false,
            clip_design: false,
            color_match: false,
            editor_mode: 0,
            extract_audio: false,
            feature_usage: { ai_text: 0, auto_process: 0, auto_speech: 0, avatar: 0, caption: 0, copy_template: 0, image_ocr: 0, multi_track: 0, recognize_speech: 0, speech_visual: 0, stroke: 0, text_template: 0 },
            image_follow_caption: false,
            lyric_recognize: false,
            manual_color_match: false,
            multi_track: false,
            mute: false,
            recognition_speech: false,
            separate_audio: false,
            speech_to_text: false,
            subtitle_source: 0,
            text_bubble: false,
            video_design: false,
            video_effect: false,
        },
        name: safeName,
        platform: "windows",
        tracks,
        version: 324500,
    };

    const meta: Record<string, unknown> = {
        app_version: "5.0.0",
        platform: "windows",
        draft_cloud_last_sync: 0,
        draft_cloud_modified: 0,
        draft_created: now,
        draft_id: draftId,
        draft_modified: now,
        draft_name: safeName,
        draft_removed: 0,
        is_sharing_draft: false,
        owner_id: "nova-canvas",
    };

    return { content, meta, assets };
}

async function resolveNodeBlob(node: CanvasNodeData): Promise<Blob | null> {
    const storageKey = node.metadata?.storageKey;
    if (storageKey) return storageKey.startsWith("image:") ? getImageBlob(storageKey) : getMediaBlob(storageKey);
    const content = node.metadata?.content;
    if (typeof content === "string" && content.startsWith("data:")) {
        try {
            return await (await fetch(content)).blob();
        } catch {
            return null;
        }
    }
    return null;
}

/** Build the JianYing draft and download it as a zip (draft JSON + assets). */
export async function exportJianYingDraft(nodes: CanvasNodeData[], connections: CanvasConnection[], name: string): Promise<void> {
    const { content, meta, assets } = compileJianYingDraft(nodes, connections, name);
    const files: { name: string; data: BlobPart }[] = [
        { name: "draft_content.json", data: JSON.stringify(content, null, 2) },
        { name: "draft_meta.json", data: JSON.stringify(meta, null, 2) },
    ];
    for (const asset of assets) {
        const node = nodes.find((item) => item.id === asset.nodeId);
        if (!node) continue;
        const blob = await resolveNodeBlob(node);
        if (blob) files.push({ name: asset.fileName, data: blob });
    }
    const zip = await createZip(files);
    saveAs(zip, `${safeFileName(name || "NovaCanvas")}.jianying.zip`);
}
