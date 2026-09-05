// Nova启画 Mock API Server
// 无外部依赖，纯 Node.js http 模块，模拟后端全部已定义端点。
// 启动方式：node server/mock-api.mjs
// 默认端口：4174（前端 Vite dev 在 3000，通过 vite.config.ts proxy 转发 /api/v1 → 4174）

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT || 4174);

// ── 内存数据 ────────────────────────────────────────────────────────────────

const users = [
    { id: "u1", email: "demo@nova.ai", name: "Demo User", password: "123456" },
];

const tokens = new Map(); // token → userId

let projects = [
    { id: "p1", name: "示例项目", scene: "ecommerce", description: "", canvas_data: "[]", status: "active", created_at: Date.now() },
];

const templates = [
    { id: "t1", name: "电商白底主图", category: "ecommerce", prompt: "{product_name} 白底高清主图，4K" },
    { id: "t2", name: "ins 风带货图", category: "ecommerce", prompt: "{product_name} ins风格生活场景图" },
    { id: "t3", name: "30s TVC 脚本", category: "advertising", prompt: "30秒TVC广告脚本，品牌{brand_name}" },
    { id: "t4", name: "短剧剧本", category: "drama", prompt: "3分钟短剧，主题{scene_description}" },
];

const recipes = [
    { id: "r1", name: "电商三件套", graph: { nodes: [], edges: [] }, description: "主图+详情+白底" },
];

// 异步任务存储
const tasks = new Map(); // taskId → { type, status, result_url, error, created_at }

// ── 工具函数 ────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function error(res, code, message, status = 400) {
    json(res, { error: { code, message } }, status);
}

function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch { resolve({}); }
        });
    });
}

function authUser(req) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    const userId = tokens.get(token);
    return userId ? users.find((u) => u.id === userId) : null;
}

function createTask(type, resultUrl, delayMs = 800) {
    const taskId = randomUUID();
    tasks.set(taskId, { task_id: taskId, type, status: "pending", result_url: resultUrl, created_at: Date.now() });
    setTimeout(() => { const t = tasks.get(taskId); if (t) t.status = "success"; }, delayMs);
    return { task_id: taskId, status: "pending", credits: 1 };
}

function pickImage() {
    const images = [
        "https://picsum.photos/seed/nova1/800/800",
        "https://picsum.photos/seed/nova2/800/800",
        "https://picsum.photos/seed/nova3/800/800",
        "https://picsum.photos/seed/nova4/800/800",
    ];
    return images[Math.floor(Math.random() * images.length)];
}

// ── 路由 ────────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method;

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (method === "OPTIONS") { res.writeHead(204); return res.end(); }

    try {
        // ── Auth ──────────────────────────────────────────────────────────
        if (path === "/api/v1/auth/register" && method === "POST") {
            const body = await parseBody(req);
            const user = { id: randomUUID(), email: body.email, name: body.name };
            users.push({ ...user, password: body.password });
            const token = randomUUID();
            tokens.set(token, user.id);
            return json(res, { user, token });
        }

        if (path === "/api/v1/auth/login" && method === "POST") {
            const body = await parseBody(req);
            const user = users.find((u) => u.email === body.email && u.password === body.password);
            if (!user) return error(res, 401, "邮箱或密码错误", 401);
            const token = randomUUID();
            tokens.set(token, user.id);
            return json(res, { user: { id: user.id, email: user.email, name: user.name }, token });
        }

        // ── Projects ─────────────────────────────────────────────────────
        if (path === "/api/v1/projects" && method === "GET") {
            return json(res, { projects, total: projects.length });
        }
        if (path === "/api/v1/projects" && method === "POST") {
            const body = await parseBody(req);
            const p = { id: randomUUID(), ...body, canvas_data: "[]", status: "active", created_at: Date.now() };
            projects.push(p);
            return json(res, p);
        }
        if (path.match(/^\/api\/v1\/projects\/[^/]+$/) && method === "PUT") {
            const id = path.split("/").pop();
            const body = await parseBody(req);
            const idx = projects.findIndex((p) => p.id === id);
            if (idx === -1) return error(res, 404, "项目不存在", 404);
            projects[idx] = { ...projects[idx], ...body };
            return json(res, projects[idx]);
        }
        if (path.match(/^\/api\/v1\/projects\/[^/]+$/) && method === "DELETE") {
            const id = path.split("/").pop();
            projects = projects.filter((p) => p.id !== id);
            return json(res, { message: "deleted" });
        }

        // ── Templates ────────────────────────────────────────────────────
        if (path === "/api/v1/templates" && method === "GET") {
            const cat = url.searchParams.get("category");
            const filtered = cat ? templates.filter((t) => t.category === cat) : templates;
            return json(res, { templates: filtered, total: filtered.length });
        }

        // ── Generation (异步任务) ────────────────────────────────────────
        if (path === "/api/v1/generate/image" && method === "POST") {
            return json(res, createTask("image", pickImage()));
        }
        if (path === "/api/v1/generate/video" && method === "POST") {
            return json(res, createTask("video", "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4", 2000));
        }
        if (path === "/api/v1/generate/style-transfer" && method === "POST") {
            return json(res, createTask("style-transfer", pickImage()));
        }
        if (path.match(/^\/api\/v1\/generate\/status\/[^/]+$/) && method === "GET") {
            const taskId = path.split("/").pop();
            const task = tasks.get(taskId);
            if (!task) return error(res, 404, "任务不存在", 404);
            return json(res, { task_id: task.task_id, type: task.type, status: task.status, result_url: task.status === "success" ? task.result_url : undefined, error: task.status === "failed" ? "生成失败" : undefined });
        }

        // ── Compliance ───────────────────────────────────────────────────
        if (path === "/api/v1/compliance/check" && method === "POST") {
            const body = await parseBody(req);
            const violations = [];
            if (/最|第一|顶级/.test(body.text)) violations.push({ keyword: "绝对化用语", category: "广告法", suggestion: "避免使用绝对化用语" });
            return json(res, { is_valid: violations.length === 0, violations, score: violations.length === 0 ? 95 : 60 });
        }
        if (path === "/api/v1/compliance/check-batch" && method === "POST") {
            const body = await parseBody(req);
            const results = (body.texts || []).map((t) => {
                const violations = /最|第一/.test(t) ? [{ keyword: "绝对化用语", category: "广告法", suggestion: "修改绝对化用语" }] : [];
                return { text: t, is_valid: violations.length === 0, violations, score: violations.length === 0 ? 95 : 60 };
            });
            return json(res, { results });
        }

        // ── Recipes ──────────────────────────────────────────────────────
        if (path === "/api/v1/recipes" && method === "GET") {
            return json(res, { recipes });
        }
        if (path === "/api/v1/recipes" && method === "POST") {
            const body = await parseBody(req);
            const r = { id: randomUUID(), ...body };
            recipes.push(r);
            return json(res, r);
        }
        if (path.match(/^\/api\/v1\/recipes\/[^/]+\/apply$/) && method === "POST") {
            return json(res, { graph: { nodes: [], edges: [] } });
        }

        // ── Workflows ────────────────────────────────────────────────────
        if (path === "/api/v1/workflows/run" && method === "POST") {
            return json(res, { id: randomUUID(), status: "success", outputs: {} });
        }

        // ── Agent Chat ───────────────────────────────────────────────────
        if (path === "/api/v1/agent/chat" && method === "POST") {
            const body = await parseBody(req);
            const lastMsg = (body.messages || []).slice(-1)[0];
            const prompt = lastMsg?.content || "";
            let reply = `收到您的需求："${prompt}"。作为Nova AI助手，我建议您先选择一个合适的模板，然后调整参数进行生成。`;
            if (/主图|产品/.test(prompt)) reply = "为您推荐电商白底主图风格。建议搭配「简洁背景+产品居中」构图，突出产品质感。是否直接生成？";
            if (/视频|短片/.test(prompt)) reply = "短视频建议15-30秒，前3秒必须抓住注意力。我帮您规划了分镜：开场（产品特写）→使用场景→卖点展示→行动号召。";
            if (/剧本|短剧/.test(prompt)) reply = "短剧剧本建议：第1集设悬念，第2集反转，第3集高潮。角色设定要鲜明，每集控制在1-2分钟。";
            return json(res, { reply });
        }

        // ── AI 能力 ──────────────────────────────────────────────────────
        if (path === "/api/v1/ai/providers" && method === "GET") {
            return json(res, {
                providers: [
                    { id: "openai", name: "OpenAI GPT-4o", kind: "chat", base_url: "https://api.openai.com/v1", model: "gpt-4o", enabled: true },
                    { id: "flux", name: "FLUX.1", kind: "image", base_url: "https://api.bFLUX.dev/v1", model: "flux-1.1-pro", enabled: true },
                    { id: "kling", name: "可灵", kind: "video", base_url: "https://api.klingai.com", model: "kling-1.5", enabled: true },
                ],
            });
        }
        if (path === "/api/v1/ai/chat" && method === "POST") {
            const body = await parseBody(req);
            return json(res, { reply: `[${body.provider}] 收到消息，正在处理...`, provider: body.provider });
        }
        if (path === "/api/v1/ai/batch-image" && method === "POST") {
            const body = await parseBody(req);
            const count = body.count || 4;
            const images = Array.from({ length: count }, (_, i) => ({
                id: randomUUID(),
                url: `https://picsum.photos/seed/batch${i + 1}/800/800`,
                prompt: body.prompt || "AI generated image",
                model: "flux-1.1-pro",
            }));
            return json(res, { images });
        }
        if (path === "/api/v1/ai/video" && method === "POST") {
            const body = await parseBody(req);
            return json(res, {
                id: randomUUID(),
                status: "success",
                url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
                duration: body.duration || 15,
                voiceover: body.voiceover || "这是一段示例配音",
                music: body.music || "背景音乐",
                shots: (body.shots || ["开场", "产品特写", "使用场景"]).map((s, i) => ({
                    index: i,
                    prompt: typeof s === "string" ? s : s.prompt || `镜头${i + 1}`,
                    image_url: `https://picsum.photos/seed/shot${i + 1}/800/800`,
                    duration: 5,
                })),
            });
        }
        if (path === "/api/v1/ai/fission" && method === "POST") {
            const body = await parseBody(req);
            const count = body.count || 3;
            const hooks = ["3秒抓眼球！", "99%的人不知道", "看完这个你就懂了", "别再踩坑了！", "揭秘行业内幕"];
            const variants = Array.from({ length: count }, (_, i) => ({
                index: i,
                hook: hooks[i % hooks.length],
                rhythm: `节奏${i + 1}：开场悬念→产品展示→痛点共鸣→行动号召`,
                shot: `镜头${i + 1}：产品特写+文字叠加`,
                copy: `${hooks[i % hooks.length]} ${body.reference} 真实体验分享`,
            }));
            return json(res, { id: randomUUID(), status: "success", reference: body.reference, count, variants });
        }
        if (path === "/api/v1/ai/ad-script" && method === "POST") {
            const body = await parseBody(req);
            return json(res, {
                id: randomUUID(),
                status: "success",
                brief: body.brief,
                style: body.style || "tv",
                scenes: [
                    { shot: 1, visual: "城市天际线，清晨光线", voiceover: "在忙碌的都市生活中...", duration: 3 },
                    { shot: 2, visual: "产品特写，慢动作旋转", voiceover: "我们为您带来了...", duration: 4 },
                    { shot: 3, visual: "使用场景，温馨家庭", voiceover: "让每一天都充满惊喜", duration: 3 },
                ],
            });
        }
        if (path === "/api/v1/ai/drama" && method === "POST") {
            const body = await parseBody(req);
            return json(res, {
                id: randomUUID(),
                status: "success",
                synopsis: body.synopsis || "一个关于成长与梦想的故事",
                characters: ["主角小明", "好友小红", "导师老王"],
                episodes: Array.from({ length: body.episodes || 3 }, (_, i) => ({
                    index: i,
                    title: `第${i + 1}集：${["初遇", "挑战", "突破"][i] || "转折"}`,
                    outline: `第${i + 1}集剧情大纲...`,
                    scenes: [`场景${i + 1}-1`, `场景${i + 1}-2`],
                })),
            });
        }

        // ── Scripts ───────────────────────────────────────────────────────
        if (path === "/api/v1/scripts" && method === "GET") {
            return json(res, { scripts: [
                { id: "s1", name: "电商主图生成器", config: { language: "javascript", source: "// 示例脚本", permissions: ["canvas", "ai"] } },
            ] });
        }
        if (path === "/api/v1/scripts" && method === "POST") {
            const body = await parseBody(req);
            return json(res, { id: randomUUID(), name: body.name, config: body.config });
        }
        if (path.match(/^\/api\/v1\/scripts\/[^/]+\/run$/) && method === "POST") {
            return json(res, { task_id: randomUUID(), status: "success", exit_code: 0, output: "脚本执行完成", error: "", duration_ms: 120, result: { images: [pickImage()] } });
        }
        if (path === "/api/v1/scripts/run" && method === "POST") {
            return json(res, { task_id: randomUUID(), status: "success", exit_code: 0, output: "内联脚本执行完成", error: "", duration_ms: 80 });
        }

        // ── Media Upload（P0 缺口的 mock）─────────────────────────────────
        if (path === "/api/v1/media/upload" && method === "POST") {
            // 模拟：接收文件但不实际存储，返回 mock URL
            return json(res, {
                url: `https://picsum.photos/seed/upload${Date.now()}/800/800`,
                storageKey: `media:${randomUUID()}`,
                width: 800,
                height: 800,
                bytes: 102400,
                mimeType: "image/jpeg",
            });
        }

        // ── 404 ──────────────────────────────────────────────────────────
        error(res, 404, `未找到路由: ${method} ${path}`, 404);
    } catch (e) {
        console.error("Mock server error:", e);
        error(res, 500, "内部服务器错误", 500);
    }
}

// ── 启动 ────────────────────────────────────────────────────────────────────

const server = createServer(handleRequest);
server.listen(PORT, () => {
    console.log(`\n  🚀 Nova Mock API 已启动: http://localhost:${PORT}/api/v1`);
    console.log(`  📋 覆盖端点: auth, projects, templates, generate/*, compliance, recipes, agent/chat, ai/*, scripts, media/upload`);
    console.log(`  🔑 测试账号: demo@nova.ai / 123456\n`);
});
