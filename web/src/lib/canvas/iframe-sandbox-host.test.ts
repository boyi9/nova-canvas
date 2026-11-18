// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIframeSandbox, type IframeSandboxOptions } from "@/lib/canvas/iframe-sandbox-host";

function createSandbox(options: Partial<IframeSandboxOptions> = {}) {
    const posted: Array<Record<string, unknown>> = [];
    const sandbox = createIframeSandbox({
        config: {
            pluginId: "test",
            manifest: { id: "test", name: "test", version: "1.0.0", capabilities: [] },
            csp: "default-src 'none'",
            srcDoc: "<!doctype html><html><body></body></html>",
        },
        ...options,
    });
    const contentWindow = sandbox.iframe.contentWindow!;
    // 截获宿主 -> iframe 的 postMessage，便于断言时序与令牌。
    vi.spyOn(contentWindow, "postMessage").mockImplementation((message: unknown) => {
        posted.push(message as Record<string, unknown>);
    });
    return { sandbox, contentWindow, posted };
}

function dispatchFrom(contentWindow: Window, data: unknown) {
    window.dispatchEvent(new MessageEvent("message", { data, source: contentWindow as unknown as MessageEventSource }));
}

function handshake(contentWindow: Window, posted: Array<Record<string, unknown>>): string {
    dispatchFrom(contentWindow, { type: "handshake" });
    const ack = posted[0] as { type: string; session: string };
    expect(ack.type).toBe("handshake");
    expect(ack.session).toBeTruthy();
    return ack.session;
}

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("iframe sandbox host channel", () => {
    it("issues a session token on handshake and ignores forged messages", () => {
        const onMessage = vi.fn();
        const { sandbox, contentWindow, posted } = createSandbox({ onMessage });

        // 没有握手令牌的伪造事件必须被丢弃
        dispatchFrom(contentWindow, { type: "event", payload: { event: "evil" } });
        expect(onMessage).not.toHaveBeenCalled();

        const session = handshake(contentWindow, posted);

        // 携带正确令牌的事件才会被处理
        dispatchFrom(contentWindow, { type: "event", session, payload: { event: "hello", payload: 1 } });
        expect(onMessage).toHaveBeenCalledWith("hello", 1);

        // 错误令牌仍被丢弃
        dispatchFrom(contentWindow, { type: "event", session: "forged", payload: { event: "evil" } });
        expect(onMessage).toHaveBeenCalledTimes(1);

        sandbox.destroy();
    });

    it("queues host calls until ready, then flushes with the session token", async () => {
        const { sandbox, contentWindow, posted } = createSandbox();

        const pending = sandbox.call<{ ok: boolean }>("ping");
        expect(posted).toHaveLength(0); // 未握手，请求进入 outbox

        const session = handshake(contentWindow, posted);
        dispatchFrom(contentWindow, { type: "event", session, payload: { event: "iframe:ready" } });
        expect(sandbox.isReady()).toBe(true);

        const request = posted.find((m) => m.type === "request")!;
        expect(request).toBeTruthy();
        expect(request.session).toBe(session);

        dispatchFrom(contentWindow, {
            type: "response",
            session,
            id: request.id,
            payload: { ok: true },
        });
        await expect(pending).resolves.toEqual({ ok: true });

        sandbox.destroy();
    });

    it("rejects pending calls when destroyed", async () => {
        const { sandbox, contentWindow, posted } = createSandbox();
        const session = handshake(contentWindow, posted);
        dispatchFrom(contentWindow, { type: "event", session, payload: { event: "iframe:ready" } });

        const pending = sandbox.call("never-resolves");
        sandbox.destroy();

        await expect(pending).rejects.toThrow(/destroyed/i);
    });
});
