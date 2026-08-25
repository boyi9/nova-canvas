import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Images, Loader2 } from "lucide-react";
import { Button, Modal, Select } from "antd";

import { batchGenerateImages, type BatchImageResult } from "@/services/nova/api";

export interface ProductOption {
    id: string;
    title: string;
    prompt: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    productNodes: ProductOption[];
}

const STYLES = [
    { value: "white", labelKey: "batchImage.style.white" },
    { value: "scene", labelKey: "batchImage.style.scene" },
    { value: "minimal", labelKey: "batchImage.style.minimal" },
    { value: "promo", labelKey: "batchImage.style.promo" },
];

export function BatchHeroImage({ open, onClose, productNodes }: Props) {
    const { t } = useTranslation();
    const [source, setSource] = useState<string>("custom");
    const [customPrompt, setCustomPrompt] = useState("");
    const [style, setStyle] = useState<string>("white");
    const [count, setCount] = useState<number>(4);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<BatchImageResult[]>([]);

    const productOptions = useMemo(
        () => productNodes.map((node) => ({ value: node.id, label: node.title || node.id })),
        [productNodes],
    );

    const basePrompt = source === "custom" ? customPrompt : productNodes.find((node) => node.id === source)?.prompt || "";

    const run = async () => {
        const prompt = basePrompt.trim();
        if (!prompt || loading) return;
        setLoading(true);
        setResults([]);
        try {
            const res = await batchGenerateImages({ prompt, count, style });
            setResults(res.images || []);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("batchImage.title")} width={720}>
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={source}
                        onChange={setSource}
                        className="w-48"
                        options={[{ value: "custom", label: t("batchImage.customPrompt") }, ...productOptions]}
                    />
                    {source === "custom" && (
                        <input
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder={t("batchImage.promptPlaceholder")}
                            className="flex-1 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                        />
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Select
                        value={style}
                        onChange={setStyle}
                        className="w-40"
                        options={STYLES.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
                    />
                    <Select
                        value={count}
                        onChange={setCount}
                        className="w-28"
                        options={[1, 2, 4, 6, 8, 10].map((n) => ({ value: n, label: `${n} 张` }))}
                    />
                    <Button type="primary" icon={<Images className="size-4" />} loading={loading} onClick={() => void run()}>
                        {t("batchImage.generate")}
                    </Button>
                </div>

                {loading && (
                    <div className="flex items-center gap-2 py-8 text-sm text-black/50 dark:text-white/50">
                        <Loader2 className="size-4 animate-spin" /> {t("batchImage.generating")}
                    </div>
                )}

                {!loading && results.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {results.map((img) => (
                            <figure key={img.id} className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                                <img src={img.url} alt={img.prompt} className="aspect-square w-full object-cover" />
                                <figcaption className="truncate px-2 py-1 text-xs text-black/50 dark:text-white/50" title={img.prompt}>
                                    {img.prompt}
                                </figcaption>
                            </figure>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
