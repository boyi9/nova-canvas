import { NovaSDK } from "./client";
import { NovaSDKError } from "./types";

function mockFetch(json: unknown, status = 200): typeof fetch {
    return (async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => json,
    })) as unknown as typeof fetch;
}

describe("NovaSDK", () => {
    it("lists providers from /ai/providers", async () => {
        const sdk = new NovaSDK({
            baseUrl: "https://api.test/v1",
            fetchImpl: mockFetch({
                providers: [{ id: "p1", name: "P1", kind: "openai", base_url: "", model: "m", enabled: true }],
            }),
        });
        const providers = await sdk.listProviders();
        expect(providers).toHaveLength(1);
        expect(providers[0].id).toBe("p1");
    });

    it("posts compliance batch texts and returns scores", async () => {
        const sdk = new NovaSDK({
            baseUrl: "https://api.test/v1",
            fetchImpl: mockFetch({ results: [{ text: "x", is_valid: true, violations: [], score: 100 }] }),
        });
        const res = await sdk.checkComplianceBatch(["x"]);
        expect(res.results[0].score).toBe(100);
    });

    it("throws NovaSDKError on non-ok responses", async () => {
        const sdk = new NovaSDK({
            baseUrl: "https://api.test/v1",
            fetchImpl: mockFetch({ error: { code: 401, message: "unauthorized", detail: "bad token" } }, 401),
        });
        await expect(sdk.login("a", "b")).rejects.toBeInstanceOf(NovaSDKError);
    });

    it("sends the bearer token from getToken", async () => {
        let capturedAuth: string | undefined;
        const sdk = new NovaSDK({
            baseUrl: "https://api.test/v1",
            getToken: () => "secret-token",
            fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
                capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
                return mockFetch({ recipes: [] })(input, init);
            }) as unknown as typeof fetch,
        });
        await sdk.listRecipes();
        expect(capturedAuth).toBe("Bearer secret-token");
    });
});
