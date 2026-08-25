import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Modal, Tag } from "antd";

import { checkComplianceBatch, type ComplianceBatchItem } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
    collectTexts: () => string[];
}

export function CanvasComplianceModal({ open, onClose, collectTexts }: Props) {
    const { t } = useTranslation();
    const [items, setItems] = useState<ComplianceBatchItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        const texts = collectTexts().map((text) => text.trim()).filter(Boolean);
        if (texts.length === 0) {
            setItems([]);
            return;
        }
        setLoading(true);
        checkComplianceBatch(texts)
            .then((res) => setItems(res.results))
            .finally(() => setLoading(false));
    }, [open, collectTexts]);

    const invalid = items.filter((item) => !item.is_valid).length;

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("canvasCompliance.title")} width={720}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-4" />
                    <span>
                        {items.length} {t("canvasCompliance.checked")} · {invalid} {t("canvasCompliance.issues")}
                    </span>
                    {loading && <span className="text-black/40 dark:text-white/40">…</span>}
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                    {items
                        .filter((item) => !item.is_valid)
                        .map((item, index) => (
                            <div key={index} className="rounded-xl border border-red-300/60 p-2 text-xs dark:border-red-500/40">
                                <p className="mb-1 truncate text-black/70 dark:text-white/70">“{item.text}”</p>
                                <div className="flex flex-wrap gap-1">
                                    {item.violations.map((v, i) => (
                                        <Tag key={i} color="red">
                                            {v.keyword} · {v.category}
                                        </Tag>
                                    ))}
                                </div>
                            </div>
                        ))}
                    {!loading && invalid === 0 && items.length > 0 && (
                        <p className="text-sm text-green-600 dark:text-green-400">{t("canvasCompliance.clean")}</p>
                    )}
                    {!loading && items.length === 0 && (
                        <p className="text-sm text-black/40 dark:text-white/40">{t("canvasCompliance.empty")}</p>
                    )}
                </div>
            </div>
        </Modal>
    );
}
