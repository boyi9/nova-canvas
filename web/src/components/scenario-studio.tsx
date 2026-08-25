import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button, Modal, Select, Tabs } from "antd";

import { generateAdScript, generateDrama, type AdScriptResult, type DramaResult } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function ScenarioStudio({ open, onClose }: Props) {
    const { t } = useTranslation();

    const [adBrief, setAdBrief] = useState("");
    const [adStyle, setAdStyle] = useState("tvc");
    const [adDuration, setAdDuration] = useState<number>(15);
    const [adResult, setAdResult] = useState<AdScriptResult | null>(null);

    const [dramaSynopsis, setDramaSynopsis] = useState("");
    const [dramaEpisodes, setDramaEpisodes] = useState<number>(3);
    const [dramaResult, setDramaResult] = useState<DramaResult | null>(null);

    const [loading, setLoading] = useState(false);

    const runAd = async () => {
        if (!adBrief.trim() || loading) return;
        setLoading(true);
        setAdResult(null);
        try {
            setAdResult(await generateAdScript({ brief: adBrief.trim(), style: adStyle, duration: adDuration }));
        } finally {
            setLoading(false);
        }
    };

    const runDrama = async () => {
        if (!dramaSynopsis.trim() || loading) return;
        setLoading(true);
        setDramaResult(null);
        try {
            setDramaResult(await generateDrama({ synopsis: dramaSynopsis.trim(), episodes: dramaEpisodes }));
        } finally {
            setLoading(false);
        }
    };

    const items = [
        {
            key: "ad",
            label: t("scenario.tab.ad"),
            children: (
                <div className="flex flex-col gap-3">
                    <textarea
                        value={adBrief}
                        onChange={(e) => setAdBrief(e.target.value)}
                        rows={3}
                        placeholder={t("scenario.adBriefPlaceholder")}
                        className="w-full resize-y rounded-xl border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Select
                            value={adStyle}
                            onChange={setAdStyle}
                            className="w-40"
                            options={[
                                { value: "tvc", label: t("scenario.style.tvc") },
                                { value: "social", label: t("scenario.style.social") },
                                { value: "festival", label: t("scenario.style.festival") },
                            ]}
                        />
                        <Select
                            value={adDuration}
                            onChange={setAdDuration}
                            className="w-28"
                            options={[
                                { value: 15, label: "15s" },
                                { value: 30, label: "30s" },
                                { value: 60, label: "60s" },
                            ]}
                        />
                        <Button type="primary" icon={loading ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} loading={loading} onClick={() => void runAd()}>
                            {t("scenario.generate")}
                        </Button>
                    </div>
                    {adResult && (
                        <ol className="space-y-2">
                            {adResult.scenes.map((scene) => (
                                <li key={scene.shot} className="rounded-xl border border-black/10 p-2 text-xs dark:border-white/10">
                                    <div className="mb-1 font-medium">
                                        {t("scenario.shot")} {scene.shot} · {scene.duration}s
                                    </div>
                                    <div className="text-black/70 dark:text-white/70">{scene.visual}</div>
                                    <div className="text-black/50 dark:text-white/50">🎙 {scene.voiceover}</div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            ),
        },
        {
            key: "drama",
            label: t("scenario.tab.drama"),
            children: (
                <div className="flex flex-col gap-3">
                    <textarea
                        value={dramaSynopsis}
                        onChange={(e) => setDramaSynopsis(e.target.value)}
                        rows={3}
                        placeholder={t("scenario.dramaSynopsisPlaceholder")}
                        className="w-full resize-y rounded-xl border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Select
                            value={dramaEpisodes}
                            onChange={setDramaEpisodes}
                            className="w-32"
                            options={[
                                { value: 2, label: "2 集" },
                                { value: 3, label: "3 集" },
                                { value: 5, label: "5 集" },
                                { value: 10, label: "10 集" },
                            ]}
                        />
                        <Button type="primary" icon={loading ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />} loading={loading} onClick={() => void runDrama()}>
                            {t("scenario.generate")}
                        </Button>
                    </div>
                    {dramaResult && (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1">
                                {dramaResult.characters.map((c) => (
                                    <span key={c} className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">{c}</span>
                                ))}
                            </div>
                            {dramaResult.episodes.map((ep) => (
                                <div key={ep.index} className="rounded-xl border border-black/10 p-2 text-xs dark:border-white/10">
                                    <div className="mb-1 font-medium">
                                        {ep.title} — {ep.outline}
                                    </div>
                                    <ul className="list-disc pl-4 text-black/60 dark:text-white/60">
                                        {ep.scenes.map((s, i) => (
                                            <li key={i}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ),
        },
    ];

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("scenario.title")} width={760}>
            <Tabs items={items} />
        </Modal>
    );
}
