import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Split } from "lucide-react";
import { Button, Modal, Select } from "antd";

import { generateFission, type FissionResult } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function HitFission({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [reference, setReference] = useState("");
    const [count, setCount] = useState<number>(10);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<FissionResult | null>(null);

    const run = async () => {
        if (!reference.trim() || loading) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await generateFission({ reference: reference.trim(), count });
            setResult(res);
        } catch {
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("fission.title")} width={760}>
            <div className="flex flex-col gap-3">
                <textarea
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    rows={3}
                    placeholder={t("fission.referencePlaceholder")}
                    className="w-full resize-y rounded-xl border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                />
                <div className="flex flex-wrap items-center gap-3">
                    <Select
                        value={count}
                        onChange={setCount}
                        className="w-36"
                        options={[
                            { value: 10, label: "10 条" },
                            { value: 20, label: "20 条" },
                            { value: 50, label: "50 条" },
                            { value: 100, label: "100 条" },
                        ]}
                    />
                    <Button type="primary" icon={loading ? <Loader2 className="size-4 animate-spin" /> : <Split className="size-4" />} loading={loading} onClick={() => void run()}>
                        {t("fission.generate")}
                    </Button>
                </div>

                {result && (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                        {result.variants.map((variant) => (
                            <div key={variant.index} className="rounded-xl border border-black/10 p-2 text-xs dark:border-white/10">
                                <div className="mb-1 flex flex-wrap gap-1">
                                    <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{variant.hook}</span>
                                    <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{variant.shot}</span>
                                    <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{variant.rhythm}</span>
                                </div>
                                <p className="text-black/70 dark:text-white/70">{variant.copy}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
