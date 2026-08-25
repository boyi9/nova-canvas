import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Play, Save, Terminal } from "lucide-react";
import { Button, Modal, Select, Tag } from "antd";

import { listScripts, runScript, runScriptInline, saveScript, type ScriptDef } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
}

const DEFAULT_SOURCE: Record<string, string> = {
    javascript: "const product = { name: '精华水', price: 99 };\nconsole.log('generating', product.name);\nresult = { prompt: `电商主图：${product.name} ${product.price}元`, ok: true };\nresult;",
    python: "print('hello from python')\n",
    bash: "echo 'hello from bash'\n",
};

export function ScriptRunner({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [scripts, setScripts] = useState<ScriptDef[]>([]);
    const [name, setName] = useState("");
    const [language, setLanguage] = useState("javascript");
    const [source, setSource] = useState(DEFAULT_SOURCE.javascript);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ status: string; output: string; error: string; duration_ms: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        listScripts()
            .then(setScripts)
            .catch(() => setScripts([]));
    }, [open]);

    const onLanguageChange = (value: string) => {
        setLanguage(value);
        setSource(DEFAULT_SOURCE[value] ?? "");
    };

    const save = async () => {
        if (!name.trim()) return;
        await saveScript(name.trim(), { language, source });
        const list = await listScripts();
        setScripts(list);
    };

    const runInline = async () => {
        setRunning(true);
        setResult(null);
        try {
            const res = await runScriptInline({ language, source });
            setResult({ status: res.status, output: res.output, error: res.error, duration_ms: res.duration_ms });
        } catch {
            setResult({ status: "failed", output: "", error: t("scripts.error"), duration_ms: 0 });
        } finally {
            setRunning(false);
        }
    };

    const runSaved = async (id: string) => {
        setRunning(true);
        setResult(null);
        try {
            const res = await runScript(id);
            setResult({ status: res.status, output: res.output, error: res.error, duration_ms: res.duration_ms });
        } catch {
            setResult({ status: "failed", output: "", error: t("scripts.error"), duration_ms: 0 });
        } finally {
            setRunning(false);
        }
    };

    const loadSaved = (def: ScriptDef) => {
        setName(def.name);
        setLanguage(def.config.language);
        setSource(def.config.source);
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("scripts.title")} width={760}>
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("scripts.namePlaceholder")}
                        className="w-44 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <Select
                        value={language}
                        onChange={onLanguageChange}
                        className="w-36"
                        options={[
                            { value: "javascript", label: "JavaScript" },
                            { value: "python", label: "Python" },
                            { value: "bash", label: "Bash" },
                        ]}
                    />
                    <Button icon={<Save className="size-4" />} onClick={() => void save()}>
                        {t("scripts.save")}
                    </Button>
                    <Button type="primary" icon={running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} loading={running} onClick={() => void runInline()}>
                        {t("scripts.run")}
                    </Button>
                </div>

                <textarea
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className="w-full resize-y rounded-xl border border-black/10 bg-black/[0.03] p-3 font-mono text-xs outline-none focus:border-black/30 dark:border-white/10 dark:bg-white/[0.03] dark:focus:border-white/30"
                />

                {result && (
                    <div className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
                        <div className="mb-1 flex items-center gap-2">
                            <Tag color={result.status === "success" ? "green" : "red"}>{result.status}</Tag>
                            <span className="text-black/50 dark:text-white/50">{result.duration_ms} ms</span>
                        </div>
                        {result.output && <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{result.output}</pre>}
                        {result.error && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-red-500">{result.error}</pre>}
                    </div>
                )}

                {scripts.length > 0 && (
                    <div>
                        <p className="mb-1 text-xs text-black/50 dark:text-white/50">{t("scripts.saved")}</p>
                        <div className="flex flex-wrap gap-2">
                            {scripts.map((def) => (
                                <div key={def.id} className="flex items-center gap-1 rounded-xl border border-black/10 px-2 py-1 text-xs dark:border-white/10">
                                    <Terminal className="size-3.5" />
                                    <button type="button" className="underline" onClick={() => loadSaved(def)}>
                                        {def.name}
                                    </button>
                                    <Button size="small" type="link" onClick={() => void runSaved(def.id)}>
                                        {t("scripts.run")}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
