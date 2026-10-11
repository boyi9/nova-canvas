/**
 * 协作域 API 客户端 —— 对接 Python 后端 /api/collab
 * 覆盖：成员与角色、分享链接、版本历史、审批流、发布排期
 */

const COLLAB_BASE = "/api/collab";

export interface CollabMember {
    user_id: string;
    role: "owner" | "editor" | "viewer";
    invited_at?: number;
    invited_by?: string;
}

export interface ShareLinkInfo {
    share_id: string;
    permission: string;
    created_by?: string;
    created_at?: number;
    expires_at: number | null;
    revoked: boolean;
    view_count: number;
    red_line?: boolean;
}

export interface ProjectVersion {
    version_id: string;
    label: string;
    created_by: string;
    created_at: number;
    note: string;
    size?: number;
    canvas_data?: string;
}

export interface ApprovalRequest {
    request_id: string;
    title: string;
    kind: string;
    status: "pending" | "approved" | "rejected" | "canceled";
    requested_by: string;
    reviewer: string;
    created_at: number;
    decided_at: number | null;
    comment: string;
}

export interface PublishScheduleItem {
    schedule_id: string;
    channel: string;
    scheduled_at: number;
    status: "pending" | "published" | "failed" | "canceled";
    created_by: string;
    executed_at: number | null;
    result: string;
    red_line?: boolean;
}

class CollabApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "CollabApiError";
    }
}

function authHeaders(): Record<string, string> {
    const token = localStorage.getItem("nova_token");
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function collabRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${COLLAB_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...((options.headers as Record<string, string>) || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new CollabApiError(body?.detail || `HTTP ${res.status}`, res.status);
    }
    return body as T;
}

// ── 成员 ────────────────────────────────────────────────────────────────
export const listMembers = (projectId: string) =>
    collabRequest<{ members: CollabMember[]; total: number }>(`/${projectId}/members`);

export const getMyRole = (projectId: string) =>
    collabRequest<{ user_id: string; role: CollabMember["role"] }>(
        `/${projectId}/members/me`,
    );

export const addMember = (projectId: string, user_id: string, role: CollabMember["role"]) =>
    collabRequest<{ user_id: string; role: string }>(`/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id, role }),
    });

export const updateMemberRole = (projectId: string, memberId: string, role: CollabMember["role"]) =>
    collabRequest<{ user_id: string; role: string }>(`/${projectId}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
    });

export const removeMember = (projectId: string, memberId: string) =>
    collabRequest<{ message: string }>(`/${projectId}/members/${memberId}`, { method: "DELETE" });

// ── 分享 ────────────────────────────────────────────────────────────────
export const listShares = (projectId: string) =>
    collabRequest<{ shares: ShareLinkInfo[]; total: number }>(`/${projectId}/shares`);

export const createShare = (projectId: string, permission: "viewer" | "editor", expires_in_s?: number) =>
    collabRequest<{ share_id: string; token: string; permission: string; url: string; expires_at: number | null }>(
        `/${projectId}/shares`,
        { method: "POST", body: JSON.stringify({ permission, expires_in_s }) },
    );

export const revokeShare = (projectId: string, shareId: string) =>
    collabRequest<{ message: string }>(`/${projectId}/shares/${shareId}`, { method: "DELETE" });

// ── 版本 ────────────────────────────────────────────────────────────────
export const listVersions = (projectId: string) =>
    collabRequest<{ versions: ProjectVersion[]; total: number }>(`/${projectId}/versions`);

export const createVersion = (projectId: string, canvas_data: string, note = "", label = "") =>
    collabRequest<{ version_id: string; label: string; created_at: number; note: string }>(
        `/${projectId}/versions`,
        { method: "POST", body: JSON.stringify({ canvas_data, note, label }) },
    );

export const getVersion = (projectId: string, versionId: string) =>
    collabRequest<ProjectVersion>(`/${projectId}/versions/${versionId}`);

export const rollbackVersion = (projectId: string, versionId: string) =>
    collabRequest<{ restored_from: string; new_version_id: string; red_line: boolean }>(
        `/${projectId}/rollback`,
        { method: "POST", body: JSON.stringify({ version_id: versionId }) },
    );

// ── 审批 ────────────────────────────────────────────────────────────────
export const listApprovals = (projectId: string, status?: string) =>
    collabRequest<{ approvals: ApprovalRequest[]; total: number; }>(
        `/${projectId}/approvals${status ? `?status=${status}` : ""}`,
    );

export const submitApproval = (projectId: string, title: string, kind = "content") =>
    collabRequest<{ request_id: string; status: string }>(`/${projectId}/approvals`, {
        method: "POST",
        body: JSON.stringify({ title, kind }),
    });

export const decideApproval = (projectId: string, requestId: string, approve: boolean, comment = "") =>
    collabRequest<{ request_id: string; status: string }>(`/${projectId}/approvals/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ approve, comment }),
    });

export const cancelApproval = (projectId: string, requestId: string) =>
    collabRequest<{ request_id: string; status: string }>(`/${projectId}/approvals/${requestId}/cancel`, {
        method: "POST",
    });

// ── 排期 ────────────────────────────────────────────────────────────────
export const listSchedules = (projectId: string) =>
    collabRequest<{ schedules: PublishScheduleItem[]; total: number; now: number }>(`/${projectId}/schedules`);

export const createSchedule = (projectId: string, channel: string, scheduled_at: number, payload = "{}") =>
    collabRequest<{ schedule_id: string; channel: string; scheduled_at: number; status: string }>(
        `/${projectId}/schedules`,
        { method: "POST", body: JSON.stringify({ channel, scheduled_at, payload }) },
    );

export const cancelSchedule = (projectId: string, scheduleId: string) =>
    collabRequest<{ schedule_id: string; status: string }>(`/${projectId}/schedules/${scheduleId}/cancel`, {
        method: "POST",
    });

export { CollabApiError };