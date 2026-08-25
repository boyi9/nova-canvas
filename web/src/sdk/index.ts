import { NovaSDK } from "./client";
import type { NovaSDKConfig } from "./types";

export function createNovaSDK(config: NovaSDKConfig = {}): NovaSDK {
    return new NovaSDK(config);
}

export { NovaSDK } from "./client";
export * from "./types";
