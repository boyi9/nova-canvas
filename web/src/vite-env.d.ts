/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

declare const __APP_VERSION__: string;
declare const __APP_RELEASES__: import("@/lib/release").ReleaseInfo[];

interface ImportMetaEnv {
    // Base public path when deployed under a subdirectory
    readonly VITE_BASE?: string;
    // Backend API base URL (default: "/api/v1")
    readonly VITE_API_URL?: string;
    // Online documentation URL
    readonly VITE_DOC_URL?: string;
    // Plugin registry CDN URL
    readonly VITE_PLUGIN_REGISTRY_URL?: string;
    // Comma-separated local development plugin URLs, refetched on every startup without caching or persistence.
    readonly VITE_DEV_PLUGINS?: string;
    // Optional build-time analytics configuration, with one independent variable per provider.
    // GA4 measurement ID (G-XXXX)
    readonly VITE_ANALYTICS_GA4_ID?: string;
    // Baidu Analytics site ID
    readonly VITE_ANALYTICS_BAIDU_ID?: string;
}
