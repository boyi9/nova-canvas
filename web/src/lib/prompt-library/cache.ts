export interface PromptItem {
    id: string;
    title: string;
    content: string;
    tags: string[];
    category?: string;
}

const DB_NAME = "nova-canvas";
const STORE = "prompts";

// In-memory fallback used when IndexedDB is unavailable (e.g. tests, private mode).
let memoryStore: PromptItem[] | null = null;

function hasIDB(): boolean {
    return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function savePromptLibrary(prompts: PromptItem[]): Promise<void> {
    if (!hasIDB()) {
        memoryStore = prompts;
        return;
    }
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        store.clear();
        for (const prompt of prompts) store.put(prompt);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

export async function loadPromptLibrary(): Promise<PromptItem[]> {
    if (!hasIDB()) {
        return memoryStore ?? [];
    }
    const db = await openDB();
    const items = await new Promise<PromptItem[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as PromptItem[]);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
}

// Pure, synchronous search used for sub-200ms local retrieval. Title matches rank
// highest; then substring matches anywhere in title/content/tags.
export function searchPrompts(prompts: PromptItem[], query: string, limit = 50): PromptItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return prompts.slice(0, limit);
    return prompts
        .map((prompt) => {
            const title = prompt.title.toLowerCase();
            const hay = `${title} ${prompt.content.toLowerCase()} ${(prompt.tags || []).join(" ").toLowerCase()}`;
            let score: number;
            if (title.startsWith(q)) score = 0;
            else if (title.includes(q)) score = 1;
            else if (hay.includes(q)) score = 2;
            else score = -1;
            return { prompt, score };
        })
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map((entry) => entry.prompt);
}

export function seedSamplePrompts(): PromptItem[] {
    return [
        { id: "p-ecom-1", title: "电商主图文案", content: "为{{product}}撰写一张高点击率电商主图文案，突出卖点与优惠。", tags: ["电商", "主图", "文案"], category: "ecommerce" },
        { id: "p-ecom-2", title: "详情页结构", content: "按 痛点-卖点-场景-信任-转化 五段式生成商品详情页结构。", tags: ["电商", "详情页"], category: "ecommerce" },
        { id: "p-ad-1", title: "TVC分镜脚本", content: "将{{brief}}拆解为15秒TVC分镜：开场钩子-产品展示-情绪升华-品牌定格。", tags: ["广告", "TVC", "分镜"], category: "advertising" },
        { id: "p-ad-2", title: "社媒短视频口播", content: "生成一段面向抖音/小红书的种草口播稿，口语化、强互动。", tags: ["广告", "社媒", "口播"], category: "advertising" },
        { id: "p-drama-1", title: "短剧人物小传", content: "基于{{synopsis}}生成三位主要角色的动机、性格与关系。", tags: ["短剧", "角色"], category: "drama" },
        { id: "p-drama-2", title: "多集大纲", content: "将故事梗概扩展为{{n}}集连续剧大纲，每集含钩子与悬念。", tags: ["短剧", "大纲"], category: "drama" },
        { id: "p-img-1", title: "白底主图提示词", content: "studio product shot, white background, soft lighting, 8k, commercial. 商品：{{product}}", tags: ["图像", "主图", "提示词"], category: "image" },
        { id: "p-img-2", title: "场景图提示词", content: "lifestyle photography, natural light, real usage scene, 8k. 场景：{{scene}}", tags: ["图像", "场景", "提示词"], category: "image" },
        { id: "p-video-1", title: "短视频分镜", content: "将{{theme}}拆为3个镜头：特写-使用-品牌，每镜3-5秒。", tags: ["视频", "分镜"], category: "video" },
        { id: "p-compliance-1", title: "合规改写", content: "检查文案中的绝对化用语与虚假宣传，给出合规替换建议。", tags: ["合规", "改写"], category: "compliance" },
    ];
}
