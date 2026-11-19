import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDevicePixelRatio } from "./use-device-pixel-ratio";

const originalDpr = window.devicePixelRatio;

function setWindowDpr(value: number) {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
}

afterEach(() => {
    setWindowDpr(originalDpr);
});

describe("useDevicePixelRatio", () => {
    it("returns the initial device pixel ratio", () => {
        setWindowDpr(2);
        const { result } = renderHook(() => useDevicePixelRatio());
        expect(result.current).toBe(2);
    });

    it("updates when the window reports a new ratio", () => {
        setWindowDpr(1);
        const { result } = renderHook(() => useDevicePixelRatio());
        expect(result.current).toBe(1);

        act(() => {
            setWindowDpr(3);
            window.dispatchEvent(new Event("resize"));
        });

        expect(result.current).toBe(3);
    });

    it("stops listening after unmount", () => {
        setWindowDpr(1);
        const { result, unmount } = renderHook(() => useDevicePixelRatio());
        unmount();

        act(() => {
            setWindowDpr(2);
            window.dispatchEvent(new Event("resize"));
        });

        expect(result.current).toBe(1);
    });
});
