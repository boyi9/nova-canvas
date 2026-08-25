import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Film, Loader2 } from "lucide-react";
import { Button, Modal, Select } from "antd";

import { generateVideoComposition, type VideoCompositionResult } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function VideoGenerator({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [shotsText, setShotsText] = useState("特写杯身\n人物畅饮\n品牌 logo 定格");
    const [duration, setDuration] = useState<number>(15);
    const [voiceover, setVoiceover] = useState("");
    const [music, setMusic] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<VideoCompositionResult | null>(null);

    const run = async () => {
        const shots = shotsText.split("\n").map((s) => s.trim()).filter(Boolean);
        if (shots.length === 0 || loading) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await generateVideoComposition({ shots, duration, voiceover, music });
            setResult(res);
        } catch {
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("video.title")} width={720}>
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-black/60 dark:text-white/60">{t("video.shots")}</span>
                </div>
                <textarea
                    value={shotsText}
                    onChange={(e) => setShotsText(e.target.value)}
                    rows={4}
                    placeholder={t("video.shotsPlaceholder")}
                    className="w-full resize-y rounded-xl border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                />
                <div className="flex flex-wrap items-center gap-3">
                    <Select
                        value={duration}
                        onChange={setDuration}
                        className="w-32"
                        options={[
                            { value: 15, label: "15s" },
                            { value: 30, label: "30s" },
                            { value: 60, label: "60s" },
                        ]}
                    />
                    <input
                        value={voiceover}
                        onChange={(e) => setVoiceover(e.target.value)}
                        placeholder={t("video.voiceover")}
                        className="w-44 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <input
                        value={music}
                        onChange={(e) => setMusic(e.target.value)}
                        placeholder={t("video.music")}
                        className="w-44 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <Button type="primary" icon={loading ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />} loading={loading} onClick={() => void run()}>
                        {t("video.generate")}
                    </Button>
                </div>

                {result && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-black/50 dark:text-white/50">
                            {t("video.shotLabel", { count: result.shots.length, duration: result.duration })}
                            {result.voiceover ? ` · ${t("video.voiceover")}: ${result.voiceover}` : ""}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {result.shots.map((shot) => (
                                <figure key={shot.index} className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                                    <img src={shot.image_url} alt={shot.prompt} className="aspect-video w-full object-cover" />
                                    <figcaption className="truncate px-2 py-1 text-xs text-black/50 dark:text-white/50" title={shot.prompt}>
                                        {shot.index}. {shot.prompt} · {shot.duration}s
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
