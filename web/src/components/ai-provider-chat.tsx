import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Send, User } from "lucide-react";
import { Button, List, Modal, Select, Spin } from "antd";

import { chatWithProvider, listProviders, type AIProvider, type ChatMessage } from "@/services/nova/api";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function AIProviderChat({ open, onClose }: Props) {
    const { t } = useTranslation();
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [provider, setProvider] = useState<string>("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        listProviders()
            .then((list) => {
                setProviders(list);
                setProvider((prev) => prev || list[0]?.id || "");
            })
            .catch(() => setProviders([]));
    }, [open]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        const next: ChatMessage[] = [...messages, { role: "user", content: text }];
        setMessages(next);
        setInput("");
        setLoading(true);
        try {
            const res = await chatWithProvider(provider, next);
            setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: t("aiChat.error") }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("aiChat.title")} width={560}>
            <div className="flex flex-col gap-3">
                <Select
                    value={provider || undefined}
                    onChange={setProvider}
                    placeholder={t("aiChat.providerPlaceholder")}
                    className="w-full"
                    options={providers.map((p) => ({ value: p.id, label: `${p.name} · ${p.model}` }))}
                />
                <div className="h-80 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    {messages.length === 0 && !loading && (
                        <p className="text-sm text-black/40 dark:text-white/40">{t("aiChat.emptyThread")}</p>
                    )}
                    <List
                        dataSource={messages}
                        renderItem={(m) => (
                            <div className={`mb-2 flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                                <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-black/5 dark:bg-white/10">
                                    {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                                </div>
                                <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-black/[0.04] px-3 py-2 text-sm dark:bg-white/[0.06]">
                                    {m.content}
                                </div>
                            </div>
                        )}
                    />
                    {loading && <Spin className="mt-2" />}
                    <div ref={bottomRef} />
                </div>
                <div className="flex gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void send();
                            }
                        }}
                        rows={2}
                        placeholder={t("aiChat.inputPlaceholder")}
                        className="flex-1 resize-none rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                    />
                    <Button type="primary" icon={<Send className="size-4" />} loading={loading} onClick={() => void send()}>
                        {t("aiChat.send")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
