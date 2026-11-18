/**
 * iframe 沙箱消息协议（host <-> plugin 共用）
 *
 * 沙箱 iframe 以不透明源（opaque origin，`window.origin === 'null'`）运行，
 * 因此无法使用精确的 targetOrigin：`postMessage(msg, origin)` 对 opaque origin
 * 永远不匹配。协议因此采用「来源 + 会话令牌」双重校验：
 *
 * 1. `event.source` 必须严格等于目标 iframe 的 contentWindow；
 * 2. 首次握手由宿主下发一次性 `session` 令牌，之后每条消息都必须携带该令牌。
 *
 * 令牌用于防止同页面内的其他脚本/嵌套帧伪造消息，弥补 targetOrigin 必须为 '*' 的不足。
 */

export const SANDBOX_MESSAGE_TYPES = ["handshake", "request", "response", "event", "error"] as const;

export type SandboxMessageType = (typeof SANDBOX_MESSAGE_TYPES)[number];

export interface SandboxMessage<T = unknown> {
    type: SandboxMessageType;
    /** 握手完成后由宿主下发的会话令牌。handshake 消息本身不需要携带。 */
    session?: string;
    id?: string;
    method?: string;
    payload?: T;
    error?: string;
}

/** 单次 RPC 超时：插件无响应时避免 Promise 永久挂起。 */
export const SANDBOX_RPC_TIMEOUT_MS = 30_000;

/** 握手超时：iframe 加载后长时间未握手则判定为不可用。 */
export const SANDBOX_HANDSHAKE_TIMEOUT_MS = 15_000;

export function isSandboxMessage(value: unknown): value is SandboxMessage {
    if (!value || typeof value !== "object") return false;
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" && (SANDBOX_MESSAGE_TYPES as readonly string[]).includes(type);
}

/** 生成不可猜测的会话令牌（优先使用 crypto.randomUUID）。 */
export function createSandboxSession(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
