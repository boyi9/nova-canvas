import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    CalendarClock,
    Check,
    Copy,
    History,
    Loader2,
    Share2,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { Button, Input, Modal, Select, Tabs } from "antd";
import { message } from "antd";

import { cn } from "@/lib/utils";
import {
    addMember,
    cancelApproval,
    cancelSchedule,
    createSchedule,
    createShare,
    createVersion,
    decideApproval,
    listApprovals,
    listMembers,
    listSchedules,
    listShares,
    listVersions,
    removeMember,
    revokeShare,
    rollbackVersion,
    submitApproval,
    type ApprovalRequest,
    type CollabMember,
    type ProjectVersion,
    type PublishScheduleItem,
    type ShareLinkInfo,
} from "@/services/nova/collab-api";

interface CollabPanelProps {
    projectId: string | null;
    open: boolean;
    onClose: () => void;
    /** 取当前画布数据，用于保存版本快照 */
    getCanvasData?: () => string;
}

const TABS = [
    { key: "members", icon: Users },
    { key: "share", icon: Share2 },
    { key: "version", icon: History },
    { key: "approval", icon: Check },
    { key: "schedule", icon: CalendarClock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CHANNELS = ["douyin", "xiaohongshu", "kuaishou", "video_channel", "tiktok", "weibo"] as const;

function fmtTime(ts?: number | null): string {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
}

export function CollabPanel({ projectId, open, onClose, getCanvasData }: CollabPanelProps) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<TabKey>("members");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [members, setMembers] = useState<CollabMember[]>([]);
    const [shares, setShares] = useState<ShareLinkInfo[]>([]);
    const [versions, setVersions] = useState<ProjectVersion[]>([]);
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [schedules, setSchedules] = useState<PublishScheduleItem[]>([]);

    const [newMemberId, setNewMemberId] = useState("");
    const [newMemberRole, setNewMemberRole] = useState<CollabMember["role"]>("viewer");
    const [versionNote, setVersionNote] = useState("");
    const [approvalTitle, setApprovalTitle] = useState("");
    const [scheduleChannel, setScheduleChannel] = useState<string>("douyin");
    const [scheduleAt, setScheduleAt] = useState<string>("");

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            // 并行拉取，单个失败不阻塞整体
            const [m, s, v, a, sc] = await Promise.all([
                listMembers(projectId).catch(() => ({ members: [], total: 0 })),
                listShares(projectId).catch(() => ({ shares: [], total: 0 })),
                listVersions(projectId).catch(() => ({ versions: [], total: 0 })),
                listApprovals(projectId).catch(() => ({ approvals: [], total: 0 })),
                listSchedules(projectId).catch(() => ({ schedules: [], total: 0, now: 0 })),
            ]);
            setMembers(m.members);
            setShares(s.shares);
            setVersions(v.versions);
            setApprovals(a.approvals);
            setSchedules(sc.schedules);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    const guard = async (fn: () => Promise<unknown>, okMsg?: string) => {
        try {
            await fn();
            if (okMsg) message.success(okMsg);
            await load();
        } catch (e) {
            message.error(e instanceof Error ? e.message : String(e));
        }
    };

    if (!open) return null;

    const roleOptions = [
        { value: "owner", label: t("collab.members.owner") },
        { value: "editor", label: t("collab.members.editor") },
        { value: "viewer", label: t("collab.members.viewer") },
    ];

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={880} centered title={t("collab.title")}>
            <Tabs
                activeKey={tab}
                onChange={(k) => setTab(k as TabKey)}
                items={TABS.map(({ key, icon: Icon }) => ({
                    key,
                    label: (
                        <span className="flex items-center gap-1.5">
                            <Icon className="size-3.5" />
                            {t(`collab.${key}.title`)}
                        </span>
                    ),
                }))}
            />

            {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("collab.loading")}
                </div>
            ) : (
                <>
                    {/* ── 成员 ── */}
                    {tab === "members" && (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Input
                                    placeholder={t("collab.members.userId")}
                                    value={newMemberId}
                                    onChange={(e) => setNewMemberId(e.target.value)}
                                />
                                <Select
                                    value={newMemberRole}
                                    onChange={setNewMemberRole}
                                    options={roleOptions}
                                    style={{ width: 120 }}
                                />
                                <Button
                                    type="primary"
                                    disabled={!newMemberId.trim()}
                                    onClick={() =>
                                        guard(async () => {
                                            await addMember(projectId!, newMemberId.trim(), newMemberRole);
                                            setNewMemberId("");
                                        })
                                    }
                                >
                                    {t("collab.members.add")}
                                </Button>
                            </div>
                            {members.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">{t("collab.empty")}</p>
                            ) : (
                                members.map((m) => (
                                    <div key={m.user_id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{m.user_id}</span>
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                {t(`collab.members.${m.role}`)}
                                            </span>
                                        </div>
                                        <Button
                                            size="small"
                                            type="text"
                                            aria-label={t("collab.members.remove")}
                                            onClick={() => guard(() => removeMember(projectId!, m.user_id))}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── 分享 ── */}
                    {tab === "share" && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                <AlertTriangle className="size-3.5 shrink-0" />
                                {t("collab.share.publicHint")}
                            </div>
                            <Button
                                type="primary"
                                onClick={() =>
                                    guard(async () => {
                                        const r = await createShare(projectId!, "viewer");
                                        const url = `${location.origin}${r.url}`;
                                        await navigator.clipboard?.writeText(url).catch(() => {});
                                        message.success(`${t("collab.share.copied")}: ${url}`);
                                    })
                                }
                            >
                                {t("collab.share.create")}
                            </Button>
                            {shares.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">{t("collab.empty")}</p>
                            ) : (
                                shares.map((s) => {
                                    const expired = s.expires_at !== null && s.expires_at * 1000 < Date.now();
                                    const dead = s.revoked || expired;
                                    return (
                                        <div key={s.share_id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                                            <div className="min-w-0 flex-1">
                                                <code className="block truncate text-xs text-muted-foreground">/share/{s.share_id}</code>
                                                <span className="text-xs text-muted-foreground">
                                                    {dead ? (s.revoked ? t("collab.share.revoked") : t("collab.share.expired")) : t("collab.share.views", { count: s.view_count })}
                                                </span>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    aria-label={t("collab.share.copy")}
                                                    disabled={dead}
                                                    onClick={async () => {
                                                        await navigator.clipboard?.writeText(`${location.origin}/share/${s.share_id}`).catch(() => {});
                                                        message.success(t("collab.share.copied"));
                                                    }}
                                                >
                                                    <Copy className="size-3.5" />
                                                </Button>
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    aria-label={t("collab.share.revoke")}
                                                    disabled={s.revoked}
                                                    onClick={() => guard(() => revokeShare(projectId!, s.share_id))}
                                                >
                                                    <X className="size-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* ── 版本 ── */}
                    {tab === "version" && (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Input
                                    placeholder={t("collab.version.notePlaceholder")}
                                    value={versionNote}
                                    onChange={(e) => setVersionNote(e.target.value)}
                                />
                                <Button
                                    type="primary"
                                    onClick={() =>
                                        guard(async () => {
                                            await createVersion(projectId!, getCanvasData?.() ?? "[]", versionNote);
                                            setVersionNote("");
                                        })
                                    }
                                >
                                    {t("collab.version.create")}
                                </Button>
                            </div>
                            {versions.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">{t("collab.empty")}</p>
                            ) : (
                                versions.map((v) => (
                                    <div key={v.version_id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                                        <div className="min-w-0">
                                            <span className="font-medium">{v.label}</span>
                                            {v.note ? <span className="ml-2 text-xs text-muted-foreground">{v.note}</span> : null}
                                            <div className="text-xs text-muted-foreground">
                                                {v.created_by} · {fmtTime(v.created_at)}
                                            </div>
                                        </div>
                                        <Button
                                            size="small"
                                            onClick={() =>
                                                Modal.confirm({
                                                    title: t("collab.version.restoreConfirm"),
                                                    okText: t("collab.version.restore"),
                                                    cancelText: t("collab.empty"),
                                                    onOk: () =>
                                                        guard(
                                                            () => rollbackVersion(projectId!, v.version_id),
                                                            t("collab.version.rollbackDone", { label: v.label }),
                                                        ),
                                                })
                                            }
                                        >
                                            {t("collab.version.restore")}
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── 审批 ── */}
                    {tab === "approval" && (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Input
                                    placeholder={t("collab.approval.subject")}
                                    value={approvalTitle}
                                    onChange={(e) => setApprovalTitle(e.target.value)}
                                />
                                <Button
                                    type="primary"
                                    disabled={!approvalTitle.trim()}
                                    onClick={() =>
                                        guard(async () => {
                                            await submitApproval(projectId!, approvalTitle.trim());
                                            setApprovalTitle("");
                                        })
                                    }
                                >
                                    {t("collab.approval.submit")}
                                </Button>
                            </div>
                            {approvals.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">{t("collab.empty")}</p>
                            ) : (
                                approvals.map((a) => (
                                    <div key={a.request_id} className="rounded-lg border border-border px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{a.title}</span>
                                            <span
                                                className={cn(
                                                    "rounded-full px-2 py-0.5 text-xs",
                                                    a.status === "approved" && "bg-success/15 text-success",
                                                    a.status === "rejected" && "bg-destructive/15 text-destructive",
                                                    a.status === "pending" && "bg-warning/15 text-warning",
                                                    a.status === "canceled" && "bg-muted text-muted-foreground",
                                                )}
                                            >
                                                {t(`collab.approval.${a.status}`)}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {t("collab.approval.by")}: {a.requested_by} · {fmtTime(a.created_at)}
                                        </div>
                                        {a.status === "pending" ? (
                                            <div className="mt-2 flex gap-2">
                                                <Button size="small" type="primary" onClick={() => guard(() => decideApproval(projectId!, a.request_id, true))}>
                                                    {t("collab.approval.approve")}
                                                </Button>
                                                <Button size="small" onClick={() => guard(() => decideApproval(projectId!, a.request_id, false))}>
                                                    {t("collab.approval.reject")}
                                                </Button>
                                                <Button size="small" type="text" onClick={() => guard(() => cancelApproval(projectId!, a.request_id))}>
                                                    {t("collab.approval.cancel")}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── 排期 ── */}
                    {tab === "schedule" && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                <AlertTriangle className="size-3.5 shrink-0" />
                                {t("collab.schedule.redLineHint")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Select
                                    value={scheduleChannel}
                                    onChange={setScheduleChannel}
                                    style={{ width: 150 }}
                                    options={CHANNELS.map((c) => ({ value: c, label: t(`collab.channels.${c}`) }))}
                                />
                                <Input
                                    type="datetime-local"
                                    value={scheduleAt}
                                    onChange={(e) => setScheduleAt(e.target.value)}
                                    style={{ width: 220 }}
                                />
                                <Button
                                    type="primary"
                                    disabled={!scheduleAt}
                                    onClick={() =>
                                        guard(async () => {
                                            const ts = new Date(scheduleAt).getTime() / 1000;
                                            await createSchedule(projectId!, scheduleChannel, ts);
                                            setScheduleAt("");
                                        })
                                    }
                                >
                                    {t("collab.schedule.create")}
                                </Button>
                            </div>
                            {schedules.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">{t("collab.empty")}</p>
                            ) : (
                                schedules.map((s) => (
                                    <div key={s.schedule_id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                                        <div>
                                            <span className="font-medium">{t(`collab.channels.${s.channel}`)}</span>
                                            <div className="text-xs text-muted-foreground">{fmtTime(s.scheduled_at)}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                {t(`collab.schedule.${s.status}`)}
                                            </span>
                                            {s.status === "pending" ? (
                                                <Button size="small" type="text" onClick={() => guard(() => cancelSchedule(projectId!, s.schedule_id))}>
                                                    {t("collab.schedule.cancel")}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </>
            )}

            {error ? (
                <div className="mt-2 flex items-center justify-between rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                    <Button size="small" type="text" onClick={() => void load()}>
                        {t("collab.retry")}
                    </Button>
                </div>
            ) : null}
        </Modal>
    );
}