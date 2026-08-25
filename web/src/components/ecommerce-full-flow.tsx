import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Loader2, ShoppingBag } from "lucide-react";
import { Button, Modal, Select } from "antd";

import { batchGenerateImages, type BatchImageResult } from "@/services/nova/api";
import type { ProductOption } from "@/components/batch-hero-image";

interface Props {
    open: boolean;
    onClose: () => void;
    productNodes: ProductOption[];
    onArrangeDetailPage: () => void;
    onRunWorkflow: () => void;
}

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
    key: string;
    label: string;
    status: StepStatus;
}

export function EcommerceFullFlow({ open, onClose, productNodes, onArrangeDetailPage, onRunWorkflow }: Props) {
    const { t } = useTranslation();
    const [source, setSource] = useState<string>(productNodes[0]?.id ?? "custom");
    const [steps, setSteps] = useState<Step[]>([]);
    const [running, setRunning] = useState(false);
    const [images, setImages] = useState<BatchImageResult[]>([]);

    const prompt =
        source === "custom"
            ? productNodes[0]?.prompt || ""
            : productNodes.find((node) => node.id === source)?.prompt || "";

    const update = (key: string, status: StepStatus) =>
        setSteps((prev) => prev.map((step) => (step.key === key ? { ...step, status } : step)));

    const run = async () => {
        const base = (prompt || "").trim();
        if (!base || running) return;
        setRunning(true);
        setImages([]);
        const initial: Step[] = [
            { key: "arrange", label: t("flow.step.arrange"), status: "pending" },
            { key: "images", label: t("flow.step.images"), status: "pending" },
            { key: "workflow", label: t("flow.step.workflow"), status: "pending" },
        ];
        setSteps(initial);

        update("arrange", "running");
        onArrangeDetailPage();
        update("arrange", "done");

        update("images", "running");
        try {
            const res = await batchGenerateImages({ prompt: base, count: 4, style: "white" });
            setImages(res.images || []);
            update("images", "done");
        } catch {
            update("images", "error");
        }

        update("workflow", "running");
        onRunWorkflow();
        update("workflow", "done");

        setRunning(false);
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("flow.title")} width={720}>
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={source}
                        onChange={setSource}
                        className="w-56"
                        options={[{ value: "custom", label: t("flow.useCanvasProduct") }, ...productNodes.map((n) => ({ value: n.id, label: n.title || n.id }))]}
                    />
                    <Button type="primary" icon={running ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />} loading={running} onClick={() => void run()}>
                        {t("flow.run")}
                    </Button>
                </div>

                <ul className="space-y-2">
                    {steps.map((step) => (
                        <li key={step.key} className="flex items-center gap-2 text-sm">
                            {step.status === "running" ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : step.status === "done" ? (
                                <CheckCircle2 className="size-4 text-green-500" />
                            ) : step.status === "error" ? (
                                <Circle className="size-4 text-red-500" />
                            ) : (
                                <Circle className="size-4 text-black/30 dark:text-white/30" />
                            )}
                            <span>{step.label}</span>
                            {step.key === "images" && step.status === "done" && (
                                <span className="text-xs text-black/50 dark:text-white/50">
                                    · {images.length} {t("flow.imagesDone")}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>

                {images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                        {images.map((img) => (
                            <img key={img.id} src={img.url} alt={img.prompt} className="aspect-square w-full rounded-lg object-cover" />
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
