import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Library } from "lucide-react";
import { Modal, Tag } from "antd";

import { loadPromptLibrary, savePromptLibrary, searchPrompts, seedSamplePrompts, type PromptItem } from "@/lib/prompt-library/cache";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function PromptLibrary({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [items, setItems] = useState<PromptItem[]>([]);
    const [query, setQuery] = useState("");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!open) return;
        loadPromptLibrary().then((loaded) => {
            if (loaded.length === 0) {
                const seeded = seedSamplePrompts();
                void savePromptLibrary(seeded);
                setItems(seeded);
            } else {
                setItems(loaded);
            }
            setReady(true);
        });
    }, [open]);

    const results = searchPrompts(items, query);

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("promptLib.title")} width={720}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                    <span>
                        {ready ? t("promptLib.cached") : t("promptLib.loading")} · {items.length} {t("promptLib.count")}
                    </span>
                    <span>⚡ IndexedDB · ≤200ms</span>
                </div>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("promptLib.searchPlaceholder")}
                    className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                />
                <div className="max-h-80 space-y-2 overflow-y-auto">
                    {results.map((item) => (
                        <div key={item.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                            <div className="mb-1 flex items-center gap-2">
                                <span className="font-medium">{item.title}</span>
                                {item.category && <Tag>{item.category}</Tag>}
                            </div>
                            <p className="text-xs text-black/60 dark:text-white/60">{item.content}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {(item.tags || []).map((tag) => (
                                    <span key={tag} className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{tag}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">{t("promptLib.empty")}</p>}
                </div>
            </div>
        </Modal>
    );
}
