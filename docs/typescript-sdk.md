# Nova Canvas TypeScript SDK

A small, framework-agnostic client for the Nova Canvas (`nova-canvas`) backend.
The SDK lives in `web/src/sdk` and mirrors every REST endpoint used by the web
app, but is decoupled from React so it can be reused in Node scripts, tests, or
other front-ends.

## Install / import

The SDK ships inside the repo (no external package yet). Import it directly:

```ts
import { createNovaSDK, NovaSDK, NovaSDKError } from "@/sdk";
```

## Configuration

`createNovaSDK(config?)` accepts:

| Option      | Type                    | Default                                | Notes                                            |
| ----------- | ----------------------- | -------------------------------------- | ------------------------------------------------ |
| `baseUrl`   | `string`                | `import.meta.env.VITE_API_URL` or `/api/v1` | Backend API root.                      |
| `getToken`  | `() => string \| null`  | reads `localStorage.nova_token`        | Returns theBearer token or `null`.               |
| `fetchImpl` | `typeof fetch`          | global `fetch`                         | Inject a custom fetch (e.g. for tests / Node).   |

```ts
const sdk = createNovaSDK({ baseUrl: "https://nova.example.com/api/v1" });

// Or fully custom (good for Node / unit tests):
const testSdk = new NovaSDK({
  baseUrl: "https://api.test/v1",
  getToken: () => "my-token",
  fetchImpl: myFetch,
});
```

Every method automatically attaches `Authorization: Bearer <token>` (when a
token is present) and throws `NovaSDKError` (with `code` and optional `detail`)
on non-2xx responses.

## Auth

```ts
const { token } = await sdk.login("you@example.com", "password");
localStorage.setItem("nova_token", token);

await sdk.register("you@example.com", "password", "You");
```

## Projects

```ts
const { projects, total } = await sdk.listProjects(20, 0);
const project = await sdk.createProject("春季详情页", "ecommerce");
await sdk.updateProject(project.id, { name: "新名字" });
await sdk.deleteProject(project.id);
```

## AI generation

```ts
// Multi-model chat
const providers = await sdk.listProviders();
const { reply } = await sdk.chatWithProvider(providers[0].id, [
  { role: "user", content: "写一句卖点文案" },
]);

// Batch hero images
const { images } = await sdk.batchGenerateImages({ prompt: "北欧风咖啡杯", count: 4 });

// Short-video composition
const video = await sdk.generateVideoComposition({ prompt: "开箱种草", duration: 30 });

// 爆款裂变
const fission = await sdk.generateFission({ reference: "一款超好用的保温杯", count: 6 });

// Ad storyboard / short-drama
const ad = await sdk.generateAdScript({ brief: "新款耳机发布", style: "tvc" });
const drama = await sdk.generateDrama({ synopsis: "普通人的逆袭", episodes: 3 });
```

## Compliance

```ts
const { is_valid, violations, score } = await sdk.checkCompliance("全网第一好用");
// Batch: scan every text node on a canvas in one call
const batch = await sdk.checkComplianceBatch(["全网第一", "普通好用的杯子"]);
```

## Recipes & workflows

```ts
const { recipes } = await sdk.listRecipes();
const { graph } = await sdk.applyRecipe(recipes[0].id, { productName: "保温杯" });
const run = await sdk.runWorkflow(graph, { discount: "8折" });
```

## Custom scripts (sandboxed)

```ts
const script = await sdk.saveScript("hello", {
  language: "javascript",
  source: "progress(50,'hi'); ({ ok: true })",
});
const result = await sdk.runScript(script.id);
// Or run inline:
const r2 = await sdk.runScriptInline({ language: "javascript", source: "1+1" });
```

> The sandbox denies `exec` / `network` / `writefs` permissions and blocks
> forbidden tokens (`require(`, `process.`, `fetch(`, `eval(`, …). Scripts that
> run too long are interrupted.

## Types

All request/response DTOs are exported from `@/sdk`:

`ChatMessage`, `AIProvider`, `BatchImageResult`, `ScriptConfig`, `ScriptDef`,
`ScriptExecutionResult`, `VideoShot`, `VideoCompositionResult`, `FissionVariant`,
`FissionResult`, `AdScene`, `AdScriptResult`, `DramaEpisode`, `DramaResult`,
`ComplianceViolation`, `ComplianceBatchItem`, `NovaSDKConfig`, `NovaSDKError`,
plus `Recipe`, `WorkflowGraph`, `WorkflowRunResponse`.

## Testing

The SDK is unit-tested (`web/src/sdk/client.test.ts`) by injecting a mock
`fetchImpl`, so no network or backend is required.
