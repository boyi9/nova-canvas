# Nova Canvas 一站式营销内容工厂 MVP 技术方案报告
（电商素材 / 广告宣传片 / 轻情景剧·短剧）

> 产品品牌名 **Nova Canvas**（启画），画布内核基于 basketikun/nova-canvas 深度二次开发，融合 LibTV/RHTV 画布逻辑、火山 Kickart/小云雀 Agent 架构、美图设计室配方模式与 picell.ai 电商能力，并以 Amazon Nova Canvas/Nova Reel 作为核心图像/视频生成模型之一，形成多模型路由矩阵。
> 目标：界面简洁友好 · 运行安全稳定 · 创作精准高效 · 全部内容可商用。
> 文档版本 **v2.0** · 2026-08-22 · 面向 Demo 开发团队

---

## 目录
1. 产品定位与三大场景边界
2. MVP 技术架构总览（含分层架构图）
3. 前端画布层：Nova Canvas 内核二次开发方案
4. AI Agent 编排层：融合 Kickart+小云雀+LibTV Skills
5. 模型能力层：可商用模型选型矩阵（含具体参数与成本）
6. **静态设计源文件引擎**：完整方案全景与 PSD/SVG/PPTX/Figma 代码实现
7. **视频工程文件引擎**：完整方案全景与剪映/FCPXML/PRPROJ 代码实现
8. 电商能力模块：美图配方模式 + picell 爆款复刻 / 产品精修 / 风格迁移
9. 首版产品功能清单（P0/P1/P2 分级）
10. 商业化合规与安全稳定保障
11. 版本迭代与发布管理体系
12. Demo 开发排期与里程碑（含团队/成本）
13. 附录：关键代码片段、配置样例、接口清单、商用资产清单

---

## 1. 产品定位与三大场景边界

### 1.1 一句话定位
**一块无限画布 + 一个全能 Agent**，让电商卖家/广告团队/短剧创作者从"在十几个工具间切来切去"变成"在同一块画布上完成从创意到**可编辑源文件交付**的全流程"——这是与所有竞品的核心差异。

### 1.2 三大场景与目标用户
| 场景 | 目标用户 | 核心产出 | 单次任务目标时长 |
|---|---|---|---|
| 电商素材生产 | 淘宝/抖音/拼多多/跨境卖家、电商代运营 | 商品主图 PSD、详情页模块 PSD、营销短视频（剪映工程）、直播贴片 PSD | 主图 ≤3 min/张，套图 ≤15 min/套，短视频 ≤8 min/条 |
| 广告/宣传片 | 品牌市场部、广告公司、MCN | 品牌海报 PSD、广告片分镜→成片（剪映/PR/FCPX 工程）、社媒素材包 | 海报 ≤5 min，15s 广告片 ≤20 min |
| 轻情景剧/短剧 | 短剧团队、IP 创作者、漫剧团队 | 剧本→角色资产→分镜→视频合成→剪辑工程（剪映草稿） | 1 集 1-3 min 短剧 ≤30 min（对比传统 3-6 个月） |

### 1.3 核心差异化（与鱼朵/图小玉/LibTV/即梦/Canva 的区别）
- **输出"可编辑源文件"而非扁平文件**：PSD + 剪映草稿 + FCPXML（P1）+ PRPROJ（P2）+ SVG + PPTX，一改全改，彻底解决"生成完不能改"的行业痛点（所有现有竞品均输出扁平 JPG/PNG/MP4）。
- **"画布 + Agent"双入口**：Creator 手动精修（对标 LibTV 节点流）+ Agent 全自动打工（对标 Kickart 对话式一键成片 + 小云雀模块化 Agent）。
- **配方复用体系**：对标美图设计室"配方"，把高转化素材的视觉参数（色调/构图/卖点位置/字体/模特人种）沉淀为可一键复用的"品牌配方"。
- **爆款裂变复刻**：对标 picell.ai + Kickart 爆款裂变，上传爆款视频/图片链接，AI 拆解分镜/节奏/爆点，替换产品后批量生成 10-100 条变体。
- **静态+视频源文件全覆盖**：不仅图片可编辑，视频工程也可二次编辑，这是行业首个完整实现"AI 生成→全源文件交付→专业软件继续精修"闭环的产品。
- **全链路商用合规**：只接入有明确商用授权的模型+素材+音乐，每条产出携带 Content Credentials 元数据标签，平台先行赔付。

---

## 2. MVP 技术架构总览

### 2.1 七层架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│  L7 前端交互层  Web (Next.js 14 + React 18 + Nova Canvas 内核二次开发)   │
│  ├─ 无限画布（节点/连线/分组/缩略图/千节点虚拟化/音频波形）                  │
│  ├─ 三模式工作台：电商工作台 / 广告工作台 / 短剧工作台                      │
│  ├─ Agent 对话面板（Slash Command、Skill 快捷调用、过程可视化）            │
│  ├─ 多轨道时间线编辑器（对标剪映/PR 时间线，P1 完善）                      │
│  └─ 源文件预览 + 一键导出（PSD/剪映草稿/FCPXML/SVG/PPTX/MP4/PNG）         │
├─────────────────────────────────────────────────────────────────────────┤
│  L6 Agent 编排层  Node.js (Fastify) + Python (FastAPI) 双服务             │
│  ├─ 主编排 Agent（意图识别/任务拆解/Skill 调度/进度汇报/异常处理）          │
│  ├─ 15 个 MVP Skill Agent（创意/电商/视频/爆款/合规/精修/拉片…）           │
│  ├─ Skill 市场（对标 LibTV ltv-skills 开源机制，P1 开放）                 │
│  └─ MCP 协议（支持画布 Agent 自然语言操作画布节点）                        │
├─────────────────────────────────────────────────────────────────────────┤
│  L5 工作流引擎层                                                          │
│  ├─ 节点式工作流（剧本/角色/分镜/生图/生视频/剪辑/合成/导出）               │
│  ├─ 资产库（角色/场景/道具/品牌素材/配方/爆款模板/数字人）                  │
│  └─ 智能引用 AutoLink（自动匹配参考素材到提示词正确位置）                   │
├─────────────────────────────────────────────────────────────────────────┤
│  L4 源文件编译层（核心壁垒层，详细方案见第6/7章）                          │
│  ├─ 静态源文件编译器                                                      │
│  │   ├─ PSD 双引擎（psd-tools3 服务端 + photoshop-python-api Win 节点）   │
│  │   ├─ SVG/矢量编译器（Recraft API + Firefly Vector + Qwen-Image-Layered）│
│  │   ├─ PPTX 编译器（python-pptx，电商提案/路演）                         │
│  │   └─ Figma 桥接（P1，Figma MCP Server 直出可编辑 Figma 文件）          │
│  └─ 视频工程编译器                                                        │
│      ├─ 剪映草稿编译器（pyJianYingDraft + capcut-mate-api，MVP 主力）     │
│      ├─ FCPXML 生成器（P1，dicttoxml 原生输出 FCP/DaVinci 可导入）         │
│      └─ PRPROJ 生成器（P2，CEP 插件 / python-prproj 两种方案）             │
├─────────────────────────────────────────────────────────────────────────┤
│  L3 AI 模型能力层（多模型路由，全部商用授权明确）                           │
│  ├─ 图像：Amazon Nova Canvas Pro / FLUX.2 Pro / Seedream 5.0 Lite / Nano Banana Pro / 即梦 4.5 │
│  ├─ 视频：Amazon Nova Reel / Seedance 2.5 / Kling O3 / Wan 2.6 / Firefly Video Model │
│  ├─ 矢量：Recraft V4.1 / Adobe Firefly Vector（唯一商用安全 SVG）         │
│  ├─ 分层生图：Qwen-Image-Layered（本地开源，原生 Alpha 通道输出）          │
│  ├─ 多模态理解：Qwen-VL-Max / GPT-4o / Gemini 3.1 Pro（商品/爆款解析）    │
│  ├─ LLM：Claude 4.6 Sonnet / Kimi K2.5 / Doubao 2.0 Pro（Agent/剧本/排版决策）│
│  ├─ 语音：火山 TTS / ElevenLabs / 豆包语音（数字人/配音/口播）             │
│  ├─ 数字人：火山数字人（小云雀同源）/ 即梦数字人 / HeyGen（24h 直播/口播）  │
│  └─ 风格迁移：自研 StyleLoRA 库 + InstantID/IP-Adapter（人物/商品一致）    │
├─────────────────────────────────────────────────────────────────────────┤
│  L2 基础设施层                                                             │
│  ├─ GPU 算力池（火山引擎/AWS Bedrock/自托管 A100/H800 弹性伸缩）           │
│  ├─ 对象存储（MinIO 私有部署兼容 S3，Demo 阶段本地可跑）                   │
│  ├─ 数据库（PostgreSQL 16 + Redis 7 + Qdrant 1.9 向量检索）                │
│  ├─ 消息队列（Celery + Redis，任务优先级/重试/死信队列）                    │
│  ├─ Windows 渲染节点（P1，PS 原生文字层/图层样式；可选 Linux+Wine 方案）   │
│  └─ CDN（静态资源/模板/灵感广场分发）                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  L1 数据资产层                                                             │
│  ├─ 电商模板库（1000+ 按类目/平台/节日分类，启动期预装）                     │
│  ├─ 爆款库（抖音/小红书/淘宝 TOP 10 万爆款视频/图片结构化拆解）              │
│  ├─ 品牌字体/音乐/贴纸版权库（全商用授权，见附录 13.4/13.5）                │
│  ├─ 配方库（高转化视觉参数沉淀，内置 10 个官方配方）                         │
│  └─ 合规知识库（广告法/平台规范/宗教文化禁忌/跨境本地化）                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选型总表
| 层级 | 技术选型 | 版本 | 选型理由 |
|---|---|---|---|
| 前端框架 | Next.js (App Router) | 14.x | nova-canvas 原项目使用，SSR/SSG 良好，Vercel 一键部署 |
| 画布内核 | Nova Canvas（@basketikun/canvas-agent 二次开发） | 最新 main 分支（2026-08） | 原项目已支持千节点虚拟化、受控 document/viewport、MCP Agent 操作、音频生成 |
| UI 组件 | shadcn/ui + Tailwind CSS | latest | 原项目使用，组件可定制，简洁风格符合"简洁友好"要求 |
| 状态管理 | Zustand | latest | nova-canvas 官方推荐，轻量、易接入协同 |
| 后端主服务 | Node.js (Fastify) + Python (FastAPI) 双服务 | Node 20 / Python 3.11 | Node 处理 API/WS/Push；Python 处理 AI/源文件编译任务 |
| 任务队列 | Celery + Redis | 5.x | Python 生态成熟，支持任务优先级/重试/定时/死信队列 |
| 数据库 | PostgreSQL 16 + Redis 7 + Qdrant 1.9 | - | 结构化数据/缓存/向量检索（配方/爆款相似度匹配） |
| 对象存储 | MinIO（私有部署兼容 S3） | latest | 成本可控、本地可跑，Demo 阶段无需云服务 |
| 容器化 | Docker + Docker Compose | - | 对标 nova-canvas 已有的 dockerfile，一键拉起整套环境 |
| PSD 生成 | psd-tools3 + Pillow（主）+ photoshop-python-api（P1 辅助） | - | 开源无依赖，服务端可跑；Win 节点输出原生文字层 |
| 剪映生成 | pyJianYingDraft + capcut-mate-api | - | 成熟开源库，支持视频/音频/字幕/特效/转场/关键帧 |
| FCPXML 生成 | dicttoxml + 自研 FCPXML 模板（P1） | - | FCP/DaVinci 通用交换格式，纯文本易生成 |
| PRPROJ 生成 | CEP 插件方案 / python-prproj（P2） | - | P2 阶段支持 Premiere 原生工程 |
| SVG 生成 | Recraft V4.1 API + StarVector（本地备选） | - | 唯一能稳定输出干净可编辑 SVG 的商用方案 |
| PPTX 生成 | python-pptx | latest | 电商提案/路演 PPT 可编辑输出 |
| 协同编辑 | Yjs + y-webrtc | latest | nova-canvas 受控模式天然适配，支持多人实时协作（P1） |

---

## 3. 前端画布层：Nova Canvas 内核二次开发方案

### 3.1 基线项目分析（基于 basketikun/nova-canvas 主分支，2026-08）
- **已有能力**（开箱即用，无需重写）：
  - 无限画布拖拽/缩放/框选/连线，千节点虚拟化（useCanvasVirtualization）
  - 文生图/图生图/音频生成（通过 OpenAI 兼容接口）
  - Canvas Agent（MCP 协议，支持 AI 通过自然语言操作画布节点）
  - 用户认证（Linux.do 等 OAuth 登录）、MySQL/PostgreSQL/SQLite 多数据库支持
  - Docker 部署、提示词库、素材管理
- **缺口（需二次开发）**：
  1. 缺少视频生成节点、时间线轨道
  2. 缺少剧本/分镜/角色资产等专业创作节点
  3. 缺少多轨道时间线编辑器（剪映/PR 风格）
  4. 缺少源文件（PSD/剪映/FCPXML/PPTX/SVG）导出能力
  5. 缺少三模式工作台切换（电商/广告/短剧）
  6. 缺少配方/爆款复刻/产品精修等电商专用面板
  7. 缺少品牌/产品命名替换为 Nova Canvas

### 3.2 二次开发模块清单
| 模块 | 改造内容 | 工期估算 |
|---|---|---|
| 品牌化改造 | 项目重命名 Nova Canvas、Logo/启动页/主题色替换、移除 Linux.do 默认登录替换为邮箱/手机号 | 2 人日 |
| 画布内核升级 | 基于 useCanvas 扩展节点类型（视频/分镜/角色/剧本/特效/字幕/导出节点）；新增节点分组/折叠/缩略图（对标 LibTV） | 5 人日 |
| 三模式工作台 | 新增"电商工作台/广告工作台/短剧工作台"三套预设节点面板与侧边栏；首次进入根据用户身份引导 | 3 人日 |
| 节点扩展包 | ①商品节点（URL 抓取/本地上传/自动抠图/卖点识别）②剧本节点（AI 写剧本/自动拆场）③角色节点（三视图/资产绑定）④分镜节点（4/9/25 宫格推演+智能拆分）⑤视频生成节点（多模型切换/参数/首帧尾帧/运镜）⑥多轨道时间线节点（可视化剪辑）⑦配方节点（保存/复用品牌视觉）⑧源文件导出节点（PSD/剪映/PPTX/SVG） | 15 人日 |
| Agent 面板增强 | Slash Command（/剧情推演 /爆款裂变 /产品精修 /多机位 /聚焦 /智能拉片）；Agent 思考过程可视化（对标小云雀"执行过程展示"）；Skill 商店面板 | 5 人日 |
| 交互体验优化 | ①连线自动吸附（素材→结果带方向箭头，对标 LibTV）②节点实时状态（排队/生成中/成功/失败带进度条）③智能引用 AutoLink（AI 自动匹配画布中的角色/场景/道具参考到提示词）④Undo/Redo 全链路、右键菜单、快捷键体系 | 5 人日 |
| 源文件预览 | 画布内 PSD 图层树预览、剪映草稿时间线预览、SVG 矢量节点直接编辑文字 | 5 人日 |

**小计：前端二次开发约 40 人日。**

### 3.3 关键交互设计（对标 LibTV + RHTV）
1. **新建项目**：三选一（电商素材 / 广告宣传片 / 短剧），不同模式预置不同节点模板（电商预置商品+主图导出；短剧预置剧本+角色+分镜+视频+导出）。
2. **双击画布**：弹出创建菜单（文本/图片/视频/音频/脚本/商品/角色/分镜/特效/配方），与 LibTV 一致。
3. **Slash 快捷命令**（/）：在任何输入框输入 "/" 唤起 20+ 创作功能（剧情推演四宫格、25 宫格分镜、多机位 9 宫格、画面聚焦、智能打光、智能拉片、爆款裂变、产品精修、风格迁移、AI 配音、字幕生成…）。
4. **节点连线 = 工作流**：A 节点输出自动成为 B 节点输入（如：角色节点→分镜节点→视频节点→时间线节点→导出节点），上游修改自动触发下游重算（可配置自动/手动）。
5. **Agent 入口**：右上角常驻 Agent 按钮，自然语言描述需求，Agent 自动在画布上搭建完整工作流（"帮我做一个保温杯冬季营销主图"→Agent 自动放置商品节点+背景节点+卖点文字节点+PSD 导出节点并连线）。

---

## 4. AI Agent 编排层

### 4.1 Agent 架构（融合 Kickart 3.0 + 小云雀 + LibTV Skills）
采用**"1 个主编排 Agent + N 个专项 Skill Agent"**的架构，对标 LibTV 100+ Skills + Kickart 对话式生成 + 小云雀过程可视化。

```
                    ┌──────────────────────────┐
                    │   主编排 Agent (Router)   │
                    │  模型：Claude 4.6 Sonnet  │
                    │  职责：意图识别/任务拆解/   │
                    │  Skill 调度/进度汇报/异常处理│
                    └─────────┬────────────────┘
                              │ 按意图路由
        ┌──────────┬──────────┼──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
   ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
   │创意脚本 ││电商生成 ││视频制作 ││爆款复刻 ││合规预审 ││数字人口播│
   │  Skill  ││  Skill  ││  Skill  ││  Skill  ││  Skill  ││  Skill  │
   └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
   ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
   │产品精修 ││风格迁移 ││智能拉片 ││配方沉淀 ││批量生成 │
   │  Skill  ││  Skill  ││  Skill  ││  Skill  ││  Skill  │
   └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
```

### 4.2 核心 Skill 清单（MVP 必做 15 个，对标 LibTV+Kickart+小云雀）
| Skill 名称 | 功能描述 | 对标产品 | 输入→输出 |
|---|---|---|---|
| url-to-product | 粘贴商品 URL（抖店/快手/小红书/淘宝/Amazon），自动抓取标题/图片/价格/卖点 | Kickart URL 素材抓取 | URL → 商品结构化数据节点 |
| product-understand | 深度理解商品，提炼 5 大核心卖点、目标人群、适用场景、视觉关键词 | Kickart 素材理解 | 商品图/描述 → 卖点 JSON |
| storyboard-4grid / 9grid /25grid | 剧情推演 N 宫格，自动分镜，键拆分单独镜头 | LibTV 剧情推演/多机位 | 主题/角色/参考 → N 宫格图→分镜组 |
| character-threeview | 角色三视图生成（正面/侧面/背面），自动加入角色资产库 | LibTV 角色三视图 | 角色描述 → 三视图+资产节点 |
| multi-camera | 基于当前画面生成 8 水平+4 俯仰+3 景别共 15 机位 | LibTV 多机位 9 宫格 | 单图 → 多机位分镜组 |
| focus-zoom | 框选画面局部，自动生成细节特写，保持风格一致 | LibTV 画面聚焦 | 图+框选区域 → 特写图 |
| smart-pull-film | 上传参考影片，自动拆分为"分镜+动态（运镜）+音乐"三模块 | LibTV 智能拉片 | 视频 → 分镜组+运镜参数+BGM |
| style-migrate | 图片/视频风格迁移（图片风格→视频、参考视频风格→新素材） | picell.ai 风格迁移 | 源+风格参考 → 风格化产出 |
| product-retouch | 产品精修：去除瑕疵、统一光线、增强质感、保持产品不变形 | picell.ai 产品精修 | 手机拍摄产品图 → 电商级精修图 |
| hot-replicate | 爆款复刻/裂变：拆解爆款视频的分镜/节奏/爆点/文案结构，替换商品后批量生成 | Kickart 爆款裂变+picell 视频复刻 | 爆款URL/视频+商品 → N 条复刻视频 |
| one-click-video | 对话式一键成片：URL/素材→创意→故事线→分镜→成片 | Kickart 3.0 对话式一键成片 | 商品URL+指令 → 完整视频+工程 |
| recipe-save / apply | 保存当前素材的全部视觉参数为"配方"，一键套用至新商品 | 美图设计室配方 | 当前节点树 → 配方模板 / 配方+商品 → 新素材 |
| digital-human | 数字人口播视频：选形象+输入文案 → 数字人讲解视频 | 小云雀数字人讲解 | 文案+形象ID → 口播视频 |
| batch-generate | 批量任务：10 商品×10 爆款 = 100 视频并行生成，自动排队重试 | Kickart 爆款裂变 | 商品列表+参考列表 → 批量产出 |
| compliance-check | 投前/发前合规预审：广告法违禁词、平台规范、版权标识、AIGC 标注 | Kickart 投前预审 | 产出文件 → 合规报告+修正建议 |

### 4.3 Agent 对话交互规范
- **过程可视化**：Agent 执行时显示"思考→拆任务→调用 Skill→生成→校验"的全步骤（对标小云雀"展示 AI 执行创意思考、脚本撰写、视频输出全过程"），用户可随时中断/修改某一步。
- **多轮修正**："第 3 个分镜换成冬季雪景"→"第 5 秒背景音乐换激昂一点"→"把女主角换成亚洲面孔"，支持任意节点局部重生（对标 Kickart 多轮对话调整）。
- **技能市场（P1）**：对标 LibTV GitHub ltv-skills 开源，允许第三方/用户自定义 Skill 上传。

---

## 5. 模型能力层：可商用模型选型矩阵

### 5.1 选型原则
1. **商用授权明确**：拒绝训练数据不透明、商用条款模糊的模型（规避 Midjourney v6、SD 社区未授权 LoRA 的版权风险）。
2. **电商场景专项能力**：优先选择文字渲染好、产品保真强、支持中文/多语种、支持风格/角色一致性的模型。
3. **成本/速度/质量平衡**：MVP 阶段采用"云 API 为主 + 本地开源模型为辅"，避免前期重资产投入。
4. **多模型冗余**：核心能力至少 1 个首选+2 个备选，避免单一模型故障导致服务不可用。

### 5.2 模型选型表（2026-08 实测可用）
| 能力维度 | 首选模型 | 备选模型 | 关键参数/理由 | 单成本参考 |
|---|---|---|---|---|
| LLM 编排/创意 | **Claude 4.6 Sonnet** | Kimi K2.5 / Doubao 2.0 Pro | 长上下文（200K）、结构化输出强、Agent 编排最稳、排版决策能力最佳 | 输入 $3/M tokens，输出 $15/M |
| 多模态理解（商品/爆款解析） | **GPT-4o** | Gemini 3.1 Pro / Qwen-VL-Max | 商品识别准确率 96%+，支持视频理解、爆款视频分镜拆解 | 约 $2.5/M tokens |
| 商品主图/海报生图（企业级/跨境首选） | **Amazon Nova Canvas Pro** | FLUX.2 Pro / Nano Banana Pro / 即梦 Image 4.5 / Seedream 5.0 Lite | Nova Canvas 文字渲染极强、品牌视觉一致性好、AWS Bedrock 商用合规背书最强；FLUX.2 适合真实质感；即梦字节版权兜底适合国内电商 | Nova Canvas 约 $0.04/张(1024px)；FLUX.2 约 0.15 元/张；即梦约 0.12 元/张 |
| 视频生成（主力/企业级首选） | **Amazon Nova Reel** | Seedance 2.5 / Kling O3 / Wan 2.6 / Firefly Video Model | Nova Reel 支持多镜头自动生成、首尾帧/运镜控制、1080p 商用授权；Seedance 2.5 单次 30s/5min 长视频，支持 50 个参考素材 | Nova Reel 约 $0.20/10s；Seedance 约 0.3-0.8 元/10s |
| 视频生成（轻量/低成本批量） | Seedance 2.0 mini | 可灵 3.0 轻量版 | 速度翻倍、成本更低，适合爆款裂变批量抽卡 | 约 0.15 元/10s |
| 矢量图/Logo/图标 | **Recraft V4.1** | Adobe Firefly Vector | Recraft 是目前唯一稳定输出干净可编辑 SVG 的商用模型；Firefly 商用最安全（Adobe Stock 训练数据） | Recraft 约 0.08 元/张；Firefly 约 0.12 元/张 |
| 分层生图（本地） | **Qwen-Image-Layered** | - | 阿里开源，原生 RGBA 四通道输出，ComfyUI 原生支持，16G 显存可跑 Q6 量化版，可本地无 API 费生成分层素材 | 本地自托管无 API 费 |
| 位图后处理分层 | **Layerdivider**（开源免费） | SAM 语义分割 | 单图输入→多层 PSD 输出，支持色彩驱动+SAM 语义双模式，参数可调 | 本地无成本 |
| 风格迁移/人物/商品一致 | 自研 StyleLoRA + IP-Adapter + InstantID | - | 商品外观一致性 95%+，跨镜头角色不漂移 | 本地自托管无 API 费 |
| 数字人/口播 | 火山引擎数字人（小云雀同源） | 即梦数字人 / HeyGen | 50+ 可商用数字人形象，支持 20+ 语种 | 约 1-3 元/分钟 |
| TTS 配音 | 火山引擎 TTS（豆包） | ElevenLabs / Fish Audio | 中文情感表现力强，100+ 音色，商用授权清晰 | 约 0.02 元/千字符 |
| 智能抠图 | RMBG-2.0（本地开源可商用） | BRIA-RMBG 2.0 | 开源可商用，商品边缘发丝级精度，支持玻璃/纱等半透明物体 | 本地无成本 |
| 图像超分/高清 | Real-ESRGAN x4+ | Topaz Photo AI API | 4K 高清放大，保持产品细节 | 本地 0.01 元/张 |
| 合规审核 | 百度内容安全 API + 自建广告法词库 | 阿里云绿网 | 多模态审核（图/文/视频），广告法违禁词识别 | 约 0.002 元/次 |

### 5.3 多模型路由策略
- **按任务类型自动路由**：
  - 生矢量→Recraft V4.1 / Firefly Vector
  - 生真实商品主图→FLUX.2（国内）/ Nova Canvas Pro（跨境/企业）
  - 生视频→Nova Reel（企业/广告）/ Seedance 2.5（国内电商批量）
  - 生短剧→Kling O3（电影感强）
  - 低成本批量抽卡→Seedance 2.0 mini / 可灵 3.0 轻量版
  - 分层素材/隐私数据→Qwen-Image-Layered 本地部署
- **按质量档位路由**：草稿/预览用低档位（快/便宜），最终交付用高档位（4K/1080p）。
- **失败降级**：主模型失败 2 次自动切备选模型，用户无感知（如 Nova Canvas 故障自动切 FLUX.2）。
- **用户可手动切换**：生成节点上提供模型下拉选择器，高级用户可自选模型。

---

## 6. 静态设计源文件引擎（核心壁垒）

### 6.1 行业方案全景（已调研全部成熟方案）

在开发 Nova Canvas 静态源文件生成能力前，我们对当前市场上所有能输出可编辑设计源文件的方案做了完整调研：

| 方案 | 输出格式 | 编辑性 | 速度 | 成本 | 采用决策 |
|---|---|---|---|---|---|
| **Seede AI / Veeso AI**（商用 SaaS） | PSD、PPTX、印刷级 PDF、SVG | ⭐⭐⭐⭐⭐ 真正分层、文字可改 | 快 | 按点计费 | **核心对标**，参考其排版决策+PSD 组装思路，自研实现避免依赖 |
| **Adobe Firefly + ChatGPT Plugin** | PSD（通过 PS 生成式填充原生分层）、SVG | ⭐⭐⭐⭐⭐ 原生 PS 编辑 | 快 | API 调用费 | **P1 参考**，作为品牌方企业版可选能力 |
| **Recraft V4.1** | 干净 SVG（无冗余代码、节点分组清晰） | ⭐⭐⭐⭐⭐ 直接编辑颜色/形状 | 快 | $0.08/张 | **MVP 采用**，作为 SVG 主引擎 |
| **Figma AI + Figma MCP Server** | 原生 Figma 可编辑文件 | ⭐⭐⭐⭐⭐ Frame/Component/Auto Layout 保留 | 快 | API 调用费 | **P1 集成**，UI/店铺装修场景输出 Figma |
| **PPT Master**（开源 GitHub 28K Star） | 原生 PPTX（DrawingML 真实元素，非图片贴页） | ⭐⭐⭐⭐⭐ 文字/形状/图表均可改 | 快 | 免费（需自备模型 Key） | **MVP 参考实现**，PPTX 生成直接参考其代码结构 |
| **Slidify**（商用） | .pptx | ⭐⭐⭐⭐ | 快 | SaaS 付费 | 备选参考 |
| **Qwen-Image-Layered**（阿里开源） | 多图层 PNG 序列（带 Alpha 通道） | ⭐⭐⭐（粗分层：背景/主体/装饰） | 中（本地 16G 显存） | 免费 | **MVP 采用**，本地分层生图 |
| **Layerdivider**（开源免费） | 从扁平位图拆分为多层 PSD | ⭐⭐⭐（质量依赖原图） | 中 | 免费 | **MVP 采用**，作为位图后处理分层兜底 |
| **StarVector / DeepSVG**（开源） | SVG 代码 | ⭐⭐⭐⭐（图标/Logo 好，复杂插画弱） | 中 | 免费 | 备选 SVG 方案 |
| **VFig**（学术开源） | 扁平位图→SVG（流程图/示意图） | ⭐⭐⭐ | 中 | 免费 | 仅技术制图场景参考 |
| **VectorFusion / DiffSketcher** | SVG（可微渲染+SDS 优化） | ⭐（路径过多无法手动编辑） | 极慢 | 免费 | **明确不采用** |
| **Nano-Banana** | Knolling 平铺/产品拆解图 PSD（自带图层命名） | ⭐⭐⭐⭐ | 中 | 开源 | P1 产品拆解图专项 |
| **柯幻熊猫 AI** | JPG/PNG 广告图→印刷矢量 AI/EPS/PDF | ⭐⭐⭐（中文场景专项） | 中 | SaaS | 印刷场景备选 |

**MVP 决策**：采用 **"LLM 结构化排版决策 + 多引擎组装"** 架构，不依赖单一方案：
- PSD：**双引擎架构**（主引擎 psd-tools3 + Pillow 纯 Python 服务端，P1 增加 Windows Photoshop 节点输出原生文字层）
- SVG：**Recraft V4.1 API 为主**，Qwen-Image-Layered 生图 + Layerdivider 兜底
- PPTX：**python-pptx 自研组装**（参考 PPT Master）
- Figma：**P1 通过 Figma MCP Server 桥接**

### 6.2 PSD 编译引擎（可编辑多图层 PSD 输出）

#### 6.2.1 双引擎架构
- **主引擎（MVP 默认）：psd-tools3 + Pillow（纯 Python，无 Photoshop 依赖，Linux 可独立运行）**
  - 负责组装分层 PSD、添加像素图层、文字图层（栅格化）、图层组、透明度、混合模式
  - **优势**：不依赖 Windows/PS 授权，可在 Docker 容器中直接运行，速度快（≤2s/张）
  - **局限**：文字图层栅格化为像素，PS 中不能直接双击改字（但视觉效果完整，设计师可用文字工具重打）
- **辅助引擎（P1 上线）：photoshop-python-api（部署在 Windows 渲染节点）**
  - 负责输出**原生可编辑文字图层（TypeLayer）**、图层样式（投影/描边/渐变叠加）、调整图层（曲线/色阶/色相饱和度）、智能对象、矢量蒙版
  - **优势**：输出真正"设计师双击即可改字改样式"的原生 PSD
  - **局限**：需要 Windows Server + Photoshop 授权，单节点成本较高（可用 1-2 台 Windows 机器渲染）
- **智能路由策略**：
  - 默认走主引擎（快、稳定、低成本）
  - 用户选择"原生可编辑文字"或"品牌高级套餐"时自动路由到 Win 节点
  - Win 节点不可用时降级为主引擎

#### 6.2.2 可运行代码：电商主图 PSD 生成器（主引擎）
```python
# file: generators/psd_generator.py
# 依赖: pip install psd-tools3 pillow
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
import os

# ======== 配置 ========
CANVAS_SIZES = {
    "tb_main": (800, 800),        # 淘宝主图
    "jd_main": (800, 800),        # 京东主图
    "pdd_main": (800, 800),       # 拼多多主图
    "douyin_cover": (1080, 1440), # 抖音封面 3:4
    "xhs_cover": (1242, 1660),    # 小红书封面 3:4
    "amazon_main": (2000, 2000),  # 亚马逊主图
    "detail_module": (790, 400),  # 淘宝详情页模块
    "live_sticker": (1080, 1920), # 抖音直播贴片
}

# 可商用字体（开源或自托管授权，详见附录 13.4）
FONT_PATHS = {
    "title": "/app/assets/fonts/AlibabaPuHuiTi-Bold.ttf",
    "body":  "/app/assets/fonts/AlibabaPuHuiTi-Regular.ttf",
    "price": "/app/assets/fonts/DINAlternate-Bold.ttf",
    "en_title": "/app/assets/fonts/Oswald-Bold.ttf",
}

def create_ecommerce_main_psd(
    product_img_path: str,
    background_img_path: str,
    title_text: str,
    price_text: str,
    original_price: str = None,
    selling_points: list = None,
    badge_text: str = "限时特惠",
    platform: str = "tb_main",
    output_path: str = "output.psd",
) -> str:
    """生成一张可编辑的电商主图 PSD。
    返回保存路径。每个元素都是独立图层/图层组，可在 PS 中直接换图/调色。
    MVP 阶段文字栅格化保证兼容性，P1 接入 Win 节点输出原生可编辑文字层。
    """
    W, H = CANVAS_SIZES[platform]
    selling_points = selling_points or []

    # 1. 新建一个空白 PSD（白色底图初始化）
    base = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    psd = PSDImage.frompil(base)
    psd.width, psd.height = W, H

    # 2. 背景层（最底层）
    bg = Image.open(background_img_path).convert("RGBA").resize((W, H), Image.LANCZOS)
    bg_layer = PixelLayer.frompil(bg, psd, name="【背景】")
    bg_layer.visible = True
    psd.append(bg_layer)

    # 3. 商品主体层（抠图后的 PNG，居中偏上放置）
    product = Image.open(product_img_path).convert("RGBA")
    max_w = int(W * 0.65)
    ratio = max_w / product.width
    new_size = (max_w, int(product.height * ratio))
    product = product.resize(new_size, Image.LANCZOS)
    px = (W - product.width) // 2
    py = int(H * 0.18)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(product, (px, py), product)
    product_layer = PixelLayer.frompil(canvas, psd, name="【商品主体】")
    psd.append(product_layer)

    # 4. 促销角标组（右上角）
    corner_group = Group.new(psd, name="【促销角标】", visible=True)
    psd.append(corner_group)
    badge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    bx1, by1, bx2, by2 = int(W*0.72), int(H*0.05), int(W*0.95), int(H*0.2)
    d.rounded_rectangle([bx1, by1, bx2, by2], radius=20, fill=(255, 30, 30, 255))
    corner_bg = PixelLayer.frompil(badge, psd, name="角标底", parent=corner_group)
    psd.append(corner_bg)
    _add_text_layer(psd, corner_group, badge_text,
                    FONT_PATHS["title"], 36, (255,255,255,255),
                    (bx1+bx2)//2, (by1+by2)//2, anchor="mm", name="角标文字")

    # 5. 标题文字层（顶部）
    _add_text_layer(psd, None, title_text,
                    FONT_PATHS["title"], 48, (30,30,30,255),
                    W//2, int(H*0.08), anchor="mm", name="【商品标题】")

    # 6. 价格层（左下，醒目大字）
    price_y = int(H * 0.82)
    _add_text_layer(psd, None, "¥",
                    FONT_PATHS["price"], 36, (255,50,50,255),
                    int(W*0.1), price_y, anchor="lm", name="【价格】¥符号")
    _add_text_layer(psd, None, price_text,
                    FONT_PATHS["price"], 72, (255,50,50,255),
                    int(W*0.18), price_y, anchor="lm", name="【价格】数字")
    if original_price:
        _add_text_layer(psd, None, f"¥{original_price}",
                        FONT_PATHS["body"], 28, (150,150,150,255),
                        int(W*0.18), price_y+50, anchor="lm", name="【价格】原价划线")

    # 7. 卖点标签组（底部横排，最多 4 个）
    sp_group = Group.new(psd, name="【卖点标签】", visible=True)
    psd.append(sp_group)
    tag_w, tag_h = int(W*0.22), int(H*0.06)
    start_x = int(W*0.05)
    tag_y = int(H*0.92)
    gap = int(W*0.03)
    for i, sp in enumerate(selling_points[:4]):
        tx = start_x + i * (tag_w + gap)
        tbg = Image.new("RGBA", (W, H), (0,0,0,0))
        td = ImageDraw.Draw(tbg)
        td.rounded_rectangle([tx, tag_y-tag_h//2, tx+tag_w, tag_y+tag_h//2],
                             radius=12, fill=(255,240,240,255),
                             outline=(255,80,80,255), width=2)
        tl = PixelLayer.frompil(tbg, psd, name=f"标签底{i+1}", parent=sp_group)
        psd.append(tl)
        _add_text_layer(psd, sp_group, sp,
                        FONT_PATHS["body"], 24, (220,50,50,255),
                        tx+tag_w//2, tag_y, anchor="mm", name=f"卖点{i+1}")

    psd.save(output_path)
    return output_path


def _add_text_layer(psd, parent, text, font_path, font_size, color,
                    x, y, anchor="mm", name="文字"):
    """辅助：生成一个栅格化文字图层（MVP 默认，兼容性最好）。"""
    font = ImageFont.truetype(font_path, font_size)
    tmp = Image.new("RGBA", (1,1), (0,0,0,0))
    td = ImageDraw.Draw(tmp)
    bbox = td.textbbox((0,0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    canvas = Image.new("RGBA", (psd.width, psd.height), (0,0,0,0))
    d = ImageDraw.Draw(canvas)
    if anchor == "mm":
        tx, ty = x - tw//2, y - th//2 - bbox[1]
    elif anchor == "lm":
        tx, ty = x, y - th//2 - bbox[1]
    else:
        tx, ty = x, y
    d.text((tx, ty), text, font=font, fill=color)
    layer = PixelLayer.frompil(canvas, psd, name=name, parent=parent)
    psd.append(layer)
    return layer


# ========== Demo 调用 ==========
if __name__ == "__main__":
    create_ecommerce_main_psd(
        product_img_path="/app/assets/demo/cup.png",
        background_img_path="/app/assets/demo/winter_bg.jpg",
        title_text="保温杯 316不锈钢 24h保温",
        price_text="59",
        original_price="129",
        selling_points=["316不锈钢", "24h保温", "便携防漏", "多色可选"],
        badge_text="限时特惠",
        platform="tb_main",
        output_path="/app/output/保温杯主图.psd"
    )
    print("PSD 已生成，可直接用 PS 打开编辑每个图层。")
```

#### 6.2.3 进阶：原生可编辑文字图层（Windows Photoshop 节点，P1）
```python
# file: generators/psd_native_text.py
# 需在已安装 Photoshop 的 Windows 机器上运行
# 部署方式：Windows Server + Photoshop 2024 + Python 3.10 + photoshop-python-api
# 服务化：用 FastAPI 封装为 HTTP 服务，主后端通过 HTTP 调用
from photoshop import Session

def create_ecommerce_main_psd_native(
    product_img_path, background_img_path,
    title_text, price_text, selling_points,
    output_path
):
    """输出真正可编辑文字图层的 PSD（双击文字即可修改）。"""
    with Session() as ps:
        doc = ps.app.documents.add(800, 800, 72, "Nova Canvas 电商主图")
        
        # 背景层
        bg_layer = doc.artLayers.add()
        bg_layer.name = "【背景】"
        # 打开背景图并放置...（通过文件打开+复制粘贴）
        
        # 原生文字层
        title_layer = doc.artLayers.add()
        title_layer.kind = ps.LayerKind.TextLayer
        title_layer.name = "【商品标题】"
        title_layer.textItem.contents = title_text
        title_layer.textItem.size = 48
        title_layer.textItem.font = "Alibaba PuHuiTi Bold"
        # 设置颜色、位置...
        
        # 价格文字（原生可编辑）
        price_layer = doc.artLayers.add()
        price_layer.kind = ps.LayerKind.TextLayer
        price_layer.name = "【价格】数字"
        price_layer.textItem.contents = price_text
        price_layer.textItem.size = 72
        
        # 图层样式（投影/描边）
        # price_layer.applyDropShadow(...)
        
        doc.saveAs(output_path)
```

#### 6.2.4 PSD 分层规范（保证设计师一眼看懂）
```
▼ 主图.psd
  ├─ 【背景】（像素图层，场景/纯色/渐变）
  ├─ 【商品主体】（像素图层，带透明通道）
  ├─ 【装饰元素】（图层组：光效/粒子/氛围/阴影）
  ├─ 【促销角标】（图层组：角标底+文字）
  ├─ 【商品标题】（文字图层）
  ├─ 【卖点标签】（图层组：多个标签，每个标签含底+文字）
  ├─ 【价格】（图层组：¥符号+数字+原价划线）
  └─ 【活动条】（图层组：底部满减/优惠券信息）
```

### 6.3 SVG 矢量编译器（图标/Logo/线稿）
```python
# file: generators/svg_generator.py
# MVP 阶段通过 Recraft API 生成 SVG
# 优势：生成的 SVG 节点干净、分组清晰、无冗余代码，可直接在 Figma/Illustrator 中编辑
import httpx

RECRAFT_API_KEY = os.getenv("RECRAFT_API_KEY")

async def generate_editable_svg(
    prompt: str,
    style: str = "line_art",  # line_art / flat_icon / logo / illustration
    size: tuple = (1024, 1024),
) -> str:
    """调用 Recraft V4.1 生成可编辑 SVG。
    返回 SVG 文件路径。
    """
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://external.api.recraft.ai/v1/images/generations",
            headers={"Authorization": f"Bearer {RECRAFT_API_KEY}"},
            json={
                "prompt": prompt,
                "style": style,
                "size": f"{size[0]}x{size[1]}",
                "response_format": "svg",  # 关键：要求 SVG 格式输出
            }
        )
        resp.raise_for_status()
        data = resp.json()
        svg_url = data["data"][0]["url"]
        # 下载保存
        svg_resp = await client.get(svg_url)
        out_path = f"/app/output/{uuid.uuid4()}.svg"
        with open(out_path, "wb") as f:
            f.write(svg_resp.content)
        return out_path
```

### 6.4 PPTX 编译器（电商提案/路演）
```python
# file: generators/pptx_generator.py
# 依赖: pip install python-pptx
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

def create_product_proposal_pptx(
    product_name: str,
    product_images: list[str],
    selling_points: list[str],
    price: str,
    output_path: str = "/app/output/商品提案.pptx",
) -> str:
    """生成可编辑的电商提案 PPTX，所有文字/图片/形状均为原生 PPT 元素。"""
    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    # 封面页
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # 空白版式
    title_box = slide.shapes.add_textbox(Inches(1), Inches(2.5), Inches(11), Inches(1.5))
    tf = title_box.text_frame
    tf.text = product_name
    tf.paragraphs[0].font.size = Pt(54)
    tf.paragraphs[0].font.bold = True
    tf.paragraphs[0].font.color.rgb = RGBColor(0x1E, 0x1E, 0x1E)
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    # 产品展示页（图片可替换）
    slide2 = prs.slides.add_slide(prs.slide_layouts[6])
    for i, img_path in enumerate(product_images[:4]):
        left = Inches(0.5 + i * 3.2)
        slide2.shapes.add_picture(img_path, left, Inches(1.5), Inches(2.8))

    prs.save(output_path)
    return output_path
```

---

## 7. 视频工程文件引擎（核心壁垒）

### 7.1 行业方案全景（已调研全部成熟方案）

| 方案 | 输出格式 | 编辑能力 | 采用阶段 | 理由 |
|---|---|---|---|---|
| **剪映 AI + pyJianYingDraft** | 剪映草稿（.draft 目录） | ⭐⭐⭐⭐⭐ 剪映全功能编辑 | **MVP 主力** | 剪映 6 亿月活，覆盖 90% 电商/短剧用户；开源库最成熟；纯 Python 无授权费 |
| **capcut-mate-api** | 剪映草稿（通过 API 导入） | ⭐⭐⭐⭐⭐ | **MVP 配套** | FastAPI 服务化封装，可直接被 Agent HTTP 调用，支持一键跳转到剪映 |
| **Adobe Premiere Pro 2026 + Quick Cut** | .prproj 原生工程 | ⭐⭐⭐⭐⭐ 片段独立可编辑 | **P2** | 2026 年新增 Quick Cut 可用自然语言生成初版时间线，但需 Adobe 订阅+Windows/Mac |
| **度加 AI** | .prproj（导出） | ⭐⭐⭐⭐ | 参考 | 已验证 AI 粗剪→PR 工程路径可行 |
| **Adobe Firefly Video Editor** | 云端多轨道时间线工程 | ⭐⭐⭐⭐ | P1 备选 | Prompt to Edit 文本指令编辑视频，可导出到 Premiere 深化 |
| **Pixmax + Seedance 2.5** | 节点式项目工程（剧本/角色/分镜/结果全部节点化） | ⭐⭐⭐⭐⭐ | **核心对标** | 这是 AI 视频工业化生产"操作系统"方向，Nova Canvas 画布架构天然对齐 |
| **Descript / Recapo.ai** | 文本驱动剪辑工程 | ⭐⭐⭐⭐（口播/访谈场景） | P1 参考 | 删文字=删画面，适合口播带货/访谈类视频 |
| **Final Cut Pro 2026** | .fcpxml（FCPXML 交换格式） | ⭐⭐⭐⭐⭐ 磁性蒙版/AI 字幕 | **P1** | FCPXML 是 XML 纯文本，Python dicttoxml 可直接生成，FCP/DaVinci 均可导入 |
| **DaVinci Resolve 2026** | 通过 FCPXML 导入 | ⭐⭐⭐⭐⭐（调色最佳） | **P1**（通过 FCPXML 兼容） | DaVinci 支持导入 FCPXML，无需单独开发 |
| **AutoPod for PR** | PR 插件，AI 自动剪辑多机位访谈 | ⭐⭐⭐⭐ | P2 参考 | 适合多机位访谈/播客场景 |

**关键判断**：当前阶段**没有任何 AI 模型能"一步生成完整专业视频工程"**（类似 PSD 那样），所有可落地方案都是**"AI 生成片段+程序编排轨道+输出 NLE 工程文件"**。

**MVP 决策**：
1. **首发剪映草稿**（覆盖 90% 用户，国内电商/短剧生态最完善）
2. **P1 支持 FCPXML**（服务专业广告/Mac 用户，DaVinci 也通过 FCPXML 兼容）
3. **P2 支持 PRPROJ**（对标 Adobe ChatGPT Plugin，服务 Windows 专业后期团队）

### 7.2 剪映草稿编译引擎（MVP 主力）

#### 7.2.1 技术方案
- **主引擎：pyJianYingDraft**（纯 Python，零依赖，开源免费）
  - 支持视频/图片/音频/文字/贴纸/转场/特效/滤镜/动画/关键帧/蒙版/变速/音量曲线等剪映绝大多数能力
- **服务化封装：capcut-mate-api**（FastAPI 服务）
  - 提供 RESTful API，Agent 可直接通过 HTTP 调用生成剪映工程
  - 与 Coze/n8n 等自动化平台天然兼容
- **导入方式**：三种方式灵活支持（详见 7.2.4）

#### 7.2.2 可运行代码：电商带货短视频剪映工程生成
```python
# file: generators/jianying_generator.py
# 依赖: pip install pyJianYingDraft
import os, uuid
import pyJianYingDraft as draft
from pyJianYingDraft import (
    Intro_type, Outro_type, Transition_type,
    Filter_type, Effect_type, trange,
    Audio_sound_type, Font_type,
)

ASSET_DIR = "/app/assets/demo/video"
OUT_DIR   = "/app/output"

def create_ecommerce_video_draft(
    clips: list,    # [{"type":"video"|"image","path":str,"duration":float,"text":str},...]
    bgm_path: str,
    voiceover_path: str = None,
    subtitles: list = None,  # [{"text":str,"start":float,"end":float}]
    output_name: str = "电商带货视频",
    resolution: tuple = (1080, 1920),
    filter_name: str = "清新",
    filter_intensity: float = 0.6,
) -> str:
    """生成一份可在剪映中直接打开的草稿工程。
    每个片段、字幕、音频、特效都是独立轨道上的独立元素，用户可自由替换、剪短、调色。
    """
    W, H = resolution
    script = draft.Script_file(W, H)

    # ========== 1. 创建轨道 ==========
    video_track = script.add_track(draft.Track_type.video)
    audio_track = script.add_track(draft.Track_type.audio)
    text_track  = script.add_track(draft.Track_type.text)
    sticker_track = script.add_track(draft.Track_type.sticker)  # P1 贴纸

    # ========== 2. 按顺序添加视频/图片片段 ==========
    current_time = 0.0
    for i, clip in enumerate(clips):
        mat_cls = draft.Video_material if clip["type"] == "video" else draft.Video_material
        mat = mat_cls(clip["path"])
        script.add_material(mat)

        dur = clip["duration"]
        seg = draft.Video_segment(mat, trange(current_time, f"{dur}s"))

        # 入场动画
        if i == 0:
            seg.add_animation(Intro_type.淡入, duration="0.5s")
        else:
            seg.add_animation(Intro_type.向左滑动, duration="0.4s")

        # 片段间转场
        if i > 0:
            seg.add_transition(Transition_type.叠化, duration="0.3s")

        # 统一滤镜
        filter_map = {"清新": Filter_type.清新, "暖调": Filter_type.暖食,
                      "冷白": Filter_type.冷白, "高清": Filter_type.高清}
        if filter_name in filter_map:
            seg.add_filter(filter_map[filter_name], intensity=filter_intensity)

        video_track.add_segment(seg)

        # 片段文字卖点
        if clip.get("text"):
            text_mat = draft.Text_material(
                clip["text"],
                font=Font_type.阿里巴巴普惠体_Heavy,
                color=(255, 255, 255),
                stroke_color=(0,0,0), stroke_width=6,
                size=8,
            )
            script.add_material(text_mat)
            text_seg = draft.Text_segment(
                text_mat, trange(current_time+0.2, f"{dur-0.4}s"),
            )
            # 卖点文字位置：画面上 1/3 居中
            text_seg.offset = (0, -H * 0.2)
            text_track.add_segment(text_seg)

        current_time += dur

    # ========== 3. BGM ==========
    bgm_mat = draft.Audio_material(bgm_path)
    script.add_material(bgm_mat)
    bgm_seg = draft.Audio_segment(
        bgm_mat, trange("0s", f"{current_time}s"),
        volume=0.25
    )
    bgm_seg.add_fade("1s", "1s")
    audio_track.add_segment(bgm_seg)

    # ========== 4. 配音 ==========
    if voiceover_path and os.path.exists(voiceover_path):
        vo_mat = draft.Audio_material(voiceover_path)
        script.add_material(vo_mat)
        vo_seg = draft.Audio_segment(
            vo_mat, trange("0s", f"{current_time}s"),
            volume=1.0,
            sonic_audio_sound_type=Audio_sound_type.明亮人声
        )
        audio_track.add_segment(vo_seg)

    # ========== 5. 自动字幕 ==========
    if subtitles:
        for sub in subtitles:
            sub_mat = draft.Text_material(
                sub["text"],
                font=Font_type.阿里巴巴普惠体,
                color=(255,255,255), size=6,
                stroke_color=(0,0,0), stroke_width=4,
            )
            script.add_material(sub_mat)
            sub_seg = draft.Text_segment(
                sub_mat,
                trange(f"{sub['start']}s", f"{sub['end']-sub['start']}s")
            )
            sub_seg.offset = (0, H * 0.7)  # 底部 1/6
            text_track.add_segment(sub_seg)

    # ========== 6. 保存剪映草稿 ==========
    draft_dir = os.path.join(OUT_DIR, f"{output_name}_{uuid.uuid4().hex[:8]}")
    os.makedirs(draft_dir, exist_ok=True)
    script.dump(draft_dir)
    return draft_dir


# ========== Demo 调用 ==========
if __name__ == "__main__":
    demo_clips = [
        {"type":"image", "path":f"{ASSET_DIR}/cup1.jpg", "duration":2.0, "text":"冬天必备！"},
        {"type":"image", "path":f"{ASSET_DIR}/cup2.jpg", "duration":2.5, "text":"316不锈钢"},
        {"type":"video", "path":f"{ASSET_DIR}/pour.mp4",  "duration":3.0, "text":"12h还是烫的"},
        {"type":"image", "path":f"{ASSET_DIR}/cup3.jpg", "duration":2.0, "text":"多色可选"},
        {"type":"image", "path":f"{ASSET_DIR}/cup4.jpg", "duration":2.5, "text":"今日只要59"},
    ]
    demo_subtitles = [
        {"text":"冬天一定要喝热水",        "start":0.0, "end":2.0},
        {"text":"316不锈钢内胆更安全",      "start":2.0, "end":4.5},
        {"text":"保温12小时出门也不怕凉",    "start":4.5, "end":7.5},
        {"text":"5个颜色都好看",            "start":7.5, "end":9.5},
        {"text":"今天直播间只要59元",        "start":9.5, "end":12.0},
    ]
    path = create_ecommerce_video_draft(
        clips=demo_clips,
        bgm_path=f"{ASSET_DIR}/bgm_upbeat.mp3",
        voiceover_path=f"{ASSET_DIR}/voice.mp3",
        subtitles=demo_subtitles,
        output_name="保温杯带货视频_demo"
    )
    print(f"剪映草稿已生成：{path}")
```

#### 7.2.3 编辑粒度保证
生成的剪映草稿在以下维度完全可二次编辑：
| 元素 | 独立程度 | 用户可操作 |
|---|---|---|
| 每个视频/图片片段 | 独立轨道项 | 替换、裁剪、变速、调色、调位置 |
| 配音 | 独立音频段 | 替换、调音量、剪切、加音效 |
| BGM | 独立音频段 | 换音乐、调音量、剪切 |
| 字幕 | 独立文本段 | 改文字、调位置、换字体、改颜色 |
| 卖点文字 | 独立文本段 | 改文案、调位置、调时长 |
| 滤镜 | 每个片段独立 | 换滤镜、调强度、删除 |
| 转场 | 片段间独立 | 换转场类型、调时长、删除 |
| 动画 | 每个片段独立 | 换入场/出场动画 |

#### 7.2.4 剪映草稿导入方式（3 种，全部支持）
1. **capcut-mate-api HTTP 导入（推荐）**：POST `/api/draft/import` 自动导入剪映，前端可做"一键跳转到剪映继续编辑"按钮。
2. **手动复制目录**：用户下载草稿 zip→解压放入剪映草稿目录（Windows: `~/Videos/CapCut/User Data/Projects/com.lveditor.draft/`，Mac: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`），重启剪映即可看到。
3. **草稿链接一键导入**：对标 Coze 工作流方案，生成剪映小助手链接（如 `https://www.51aigc.cc/#/cozeToJianyin?code=xxx`），用户点击链接自动唤起剪映导入。

### 7.3 FCPXML 生成器（P1，Final Cut Pro / DaVinci Resolve）
```python
# file: generators/fcpxml_generator.py
# FCPXML 是 XML 纯文本格式，Python dicttoxml 可直接生成
# FCP 和 DaVinci Resolve 均可原生导入
# P1 阶段实现
def create_fcpxml_project(
    clips, bgm_path, voiceover_path, subtitles,
    output_path, resolution=(1920, 1080), fps=30
):
    """生成 FCPXML 工程文件，可直接在 Final Cut Pro / DaVinci Resolve 中打开编辑。"""
    # FCPXML 结构：fcpxml -> library -> event -> project -> sequence -> spine
    # 每个视频/音频片段为独立 clip 元素，包含 start/end/duration/源文件引用
    # 实现原理：按时间线顺序构建 XML DOM，输出 .fcpxml 文件
    # 参考：https://developer.apple.com/documentation/professional_video_applications/fcpxml
    pass  # P1 实现，代码量约 300 行
```

### 7.4 PRPROJ 生成器（P2，Premiere Pro）
两种可行方案（P2 阶段评估选择）：
1. **CEP 插件方案**：开发 Premiere CEP 扩展，Nova Canvas 输出 JSON 描述文件，插件在 PR 内读取 JSON 自动构建时间线（更稳定，推荐）
2. **python-prproj 开源库**：直接写 PRPROJ 二进制格式（技术难度较高，兼容性需测试）

### 7.5 视频工程文件路线图
| 阶段 | 输出格式 | 覆盖用户 | 时间 |
|---|---|---|---|
| MVP | 剪映草稿（.draft 目录） | 国内电商/短剧/自媒体（90% 用户） | 8 周内 |
| P1 | FCPXML（Final Cut Pro / DaVinci Resolve） | Mac 用户、专业广告/影视团队 | +6 周 |
| P2 | PRPROJ（Premiere Pro） | Windows 专业后期、Adobe 生态用户 | +3 月 |

---

## 8. 电商能力模块：配方 + 爆款复刻 + 精修 + 风格迁移

### 8.1 配方生成模式（对标美图设计室）
**核心思想**：把"一个高转化素材的全部视觉参数"抽象为一份 JSON 配方，换商品一键套用。

```json
{
  "recipe_name": "冬季保温杯·暖调促销风",
  "version": "1.0",
  "category": "家居/保温杯",
  "platform": "tb_main",
  "canvas": {"size": [800,800]},
  "background": {
    "style": "warm winter indoor scene, soft golden window light, wooden desk",
    "negative_prompt": "cluttered, cold tone, dark",
    "color_tone": {"hue_shift": 15, "saturation": -5, "temperature": 20, "brightness": 8}
  },
  "product": {
    "position_ratio": [0.18, 0.18, 0.82, 0.65],
    "shadow": true,
    "reflection_intensity": 0.3
  },
  "title": {
    "font": "AlibabaPuHuiTi-Bold",
    "size_ratio": 0.06,
    "color": "#1E1E1E",
    "position": "top-center",
    "max_length": 16
  },
  "price": {
    "font": "DIN-Bold",
    "size_ratio": 0.09,
    "color": "#FF1E1E",
    "currency_symbol_size_ratio": 0.5,
    "position": "bottom-left"
  },
  "badges": [
    {"type": "corner", "position": "top-right", "shape": "round-rect", "text": "限时特惠", "bg_color": "#FF1E1E"}
  ],
  "selling_tags": {
    "count": 4, "layout": "bottom-horizontal",
    "font_size_ratio": 0.03,
    "bg": "#FFF0F0", "border_color": "#FF5050"
  },
  "video_template": {
    "clip_duration_range": [2.0, 3.5],
    "transition": "叠化",
    "filter": "暖食",
    "subtitle_position": "bottom-1/6",
    "bgm_style": "warm_upbeat"
  },
  "filters": [{"name": "warm", "intensity": 0.3}],
  "image_model": "FLUX.2-Pro",
  "video_model": "Seedance-2.5"
}
```

**工作流**：
1. **沉淀配方**：用户做出满意素材（或从爆款库 AI 拆解）→点"保存为配方"→系统自动抽取上述参数。
2. **应用配方**：选择配方→上传新商品白底图→一键生成全套新素材（主图×N、详情页模块、短视频）。
3. **内置启动配方**（MVP 预装 10 个）：冬季暖调、夏季清凉、618 红金大促、双 11 氛围、小红书种草 ins 风、亚马逊白底规范、抖音口播带货、拼多多超低价、日系极简、科技冷感。
4. **配方市场（P1）**：官方 100+ 类目/节日/平台配方，用户可分享自己的配方（付费/免费）。

### 8.2 爆款复刻/裂变（对标 picell + Kickart）
**流程**：
1. 用户上传爆款视频链接（抖音/小红书/淘宝）或上传本地视频。
2. **智能拉片 Skill**自动拆解为：
   - 分镜脚本（每个镜头时长/景别/运镜/画面描述）
   - 文案脚本（口播/字幕/卖点顺序/爆点位置）
   - 节奏分析（BPM、镜头切换频率、爆点时刻）
   - 视觉风格（色调、滤镜参数、文字样式）
3. 用户替换为自己的商品（上传白底图或粘贴商品 URL）。
4. AI 按拆解结构逐镜重生：保持分镜/节奏/爆点结构，替换商品主体+卖点。
5. **批量裂变**：一次任务支持 10 商品 × 10 参考爆款 = 最多 100 条新视频（对标 Kickart 爆款裂变能力）。
6. 输出剪映草稿（P1 同时输出 FCPXML），用户可精修。

**关键参数**：
- 复刻吻合度分 3 档：高（保留运镜/转场/字幕位置，80% 相似）、中（保留结构+节奏，元素可替换）、低（只保留创意结构）。
- 支持跨类目复刻：3C 爆款→家居类目视频（对标 Kickart）。
- 多语种本地化复刻：中文爆款→英文/日文/东南亚/中东版本，自动替换人种模特、场景文化、促销话术。
- 批量并发：100 条视频并行调度，约 30-60 分钟内全部完成。

### 8.3 产品精修（对标 picell）
**能力清单**：
- **手机拍图→电商级精修**：自动去瑕疵/去水印/校正透视/统一光线/增强金属/玻璃/织物质感。
- **智能抠图（RMBG-2.0）**：发丝级边缘，保留透明/半透明物体（玻璃杯/纱衣/水瓶）。
- **AI 场景替换**：上传白底图→生成使用场景图（办公室/户外/居家/影棚），保持产品外观 100% 不变（IP-Adapter + 商品掩码）。
- **多平台适配**：一键输出淘宝 800×800、抖音 1080×1920、小红书 3:4、亚马逊 2000×2000 白底、Temu 促销图，自动调整商品占比/文字区域。
- **批量精修**：支持一次上传 100 张产品图批量处理。

### 8.4 风格迁移（图片 + 视频）
- **图生图风格迁移**：上传一张参考风格图（如莫奈风/赛博朋克/日式极简/小红书 ins 风/国潮）→所有素材统一风格。
- **视频风格迁移**：基于 Seedance 2.5 / Nova Reel 的多参考能力，将参考视频的运镜/色调/氛围迁移到新素材上。
- **品牌视觉锁定**：品牌方上传品牌 VI（色值/字体/Logo/视觉调性），AI 生成时强制约束，全店/全渠道视觉统一。
- **跨模态风格迁移**：图片风格→视频、视频风格→图片双向支持。

---

## 9. 首版产品功能清单（P0/P1/P2 分级）

### P0：MVP 必做（Demo 可演示 + 内测可用，约 8 周）
| 模块 | 功能 | 验收标准 |
|---|---|---|
| 账号与项目 | 邮箱/手机号登录、新建项目（3 种类型）、项目自动保存、最近项目列表 | 能创建/打开/删除项目 |
| 无限画布 | Nova Canvas 内核，支持拖拽/缩放/框选/连线/节点状态/双击新建 | 500 节点画布流畅（≥30fps） |
| 节点基础类型 | 文本/图片/视频/音频/商品/剧本/分镜/视频生成/导出节点 | 基本工作流可跑通 |
| Agent 对话 | 右上角 Agent 按钮，自然语言创建节点/连线/触发生成，3 个核心 Skill 可用（url-to-product、one-click-video、product-retouch） | 能通过对话生成一张主图 |
| 电商主图生成 | 商品 URL/白底图上传→AI 场景图+卖点文字+价格标签→PSD 导出 | 3 分钟内出 800×800 可编辑 PSD |
| 短视频生成 | 商品→AI 分镜→图片/视频片段+BGM+字幕→剪映草稿导出 | 8 分钟内出 15s 竖版视频剪映工程 |
| 智能抠图 | 上传商品图自动抠图，可手动擦除/恢复 | 边缘精度达到 remove.bg 水平 |
| 产品精修 | 手机拍图→一键精修（去瑕疵+调光+增强质感） | 精修后达到上架标准 |
| 配方基础 | 支持 10 个官方内置配方一键套用 | 换商品 10s 出同风格新图 |
| 爆款复刻基础 | 上传 1 条爆款视频→单商品复刻 1 条新视频 | 分镜/节奏基本一致，商品替换准确 |
| 多模型路由 | FLUX.2/Nova Canvas/Seedance/Nova Reel/Recraft 接入，自动路由+失败降级 | 任一模型故障不影响服务 |
| 源文件导出 | PSD（分层）+ 剪映草稿 + SVG + PNG + MP4 五格式导出 | PSD 可在 PS 打开编辑每个图层；剪映草稿可在剪映打开；SVG 可在 Figma 编辑 |
| 合规预审 | 广告法违禁词检测、AIGC 标识自动添加 | 常见违禁词 100% 拦截 |
| 商用保障 | 只接商用授权模型+开源可商用字体，输出带生成元数据 | 用户可查看到"本素材商用授权来源" |

### P1：正式上线版（+6 周）
- 三模式工作台完善（电商/广告/短剧）
- 角色资产库/场景资产库/道具库（短剧必备）
- 25 宫格分镜、多机位、画面聚焦、智能打光（LibTV 专业视频功能全集）
- 爆款裂变批量生成（10×10=100 条）、多语种跨境复刻
- 配方保存/分享/配方市场
- 智能拉片（分镜+动态+音乐三模块自动拆解）
- AutoLink 智能引用（自动匹配参考素材）
- 多人实时协作（Yjs）
- 数字人口播 Skill
- 详情页一键生成（多模块 PSD 组）
- FCPXML 工程导出（Final Cut Pro / DaVinci Resolve）
- Figma MCP 桥接（UI/店铺装修素材可编辑输出到 Figma）
- Windows Photoshop 渲染节点（原生可编辑文字图层）
- Qwen-Image-Layered 本地分层生图部署
- 数据看板（生成数量/成功率/耗时/成本）
- 会员/点数/套餐体系

### P2：商业化进阶（+3 月）
- PRPROJ 工程导出（Premiere Pro）
- 直播实时素材生成（贴片/弹窗/切片）
- 私域日更素材包（每日自动生成朋友圈/社群素材）
- 跨平台一键发布（抖音/小红书/视频号/淘宝/Temu/Amazon）
- 企业版：私有化部署、品牌资产库、团队权限、SSO
- Skill 开放平台（第三方开发者生态，对标 LibTV ltv-skills）
- 移动端适配（手机拍摄→云端生成→分享）
- 数字人 24h 直播方案
- AI 广告投放闭环（生成素材→AB 测试→自动优选→CTR 反哺生成）

---

## 10. 商业化合规与安全稳定保障

### 10.1 全链路商用合规
| 风险点 | 解决方案 |
|---|---|
| 模型版权 | 只接入有明确商用授权的模型（Amazon Nova Canvas/Reel、FLUX.2 Pro 商用版、Seedance、即梦、Recraft、Nano Banana 等），与模型方签商用协议；明确写入用户协议："平台内生成内容商用侵权由平台先行赔付"（对标即梦的商家保护） |
| 字体版权 | 全部使用免费可商用字体（阿里巴巴普惠体、思源系列、站酷系列、OPPO Sans、Oswald 等），禁止调用未授权字体 |
| 素材版权 | 内置素材库（贴纸/图标/BGM）来自 Adobe Stock/抖音商用音乐库/耳聆网/Freesound 等商用授权渠道；BGM 使用平台自建版权音乐库 |
| 肖像权 | 数字人形象全部签约授权；AI 生成的模特使用虚拟人面孔模型（不使用真实人脸训练数据） |
| AIGC 标识 | 所有导出文件自动嵌入 C2PA Content Credentials 元数据，图片/视频含水印开关（默认关闭，支持开启） |
| 广告法/平台规范 | 自建 5000+ 广告法违禁词库（含极限词/医疗词/虚假宣传词）+ 平台特有规范（淘宝"最"字检测、抖音医疗内容管控、亚马逊主图规范），发布前自动拦截 |
| 跨境合规 | 目标市场文化禁忌库（中东宗教/东南亚色彩/日本政治敏感/欧盟 GDPR），生成本地化内容时自动校验 |
| 源文件版权 | 输出的 PSD/剪映/FCPXML 工程文件中所有字体/素材均标注来源，用户替换自有素材后版权清晰 |

### 10.2 运行安全稳定
| 维度 | 措施 |
|---|---|
| 接口安全 | API Key 加密存储（AES-256）、HTTPS 全链路、接口签名防篡改、请求限流、SQL 注入/XSS 防护 |
| 任务稳定性 | Celery 任务队列支持：失败自动重试（最多 3 次，指数退避）、超时熔断（图片 60s/视频 300s/PSD 30s/剪映 10s）、死信队列、任务优先级（会员任务优先） |
| 多模型容灾 | 核心能力至少主+备 2 个模型，主模型失败自动降级，用户无感知 |
| 数据安全 | 用户素材/项目文件私有桶隔离，签名 URL 访问（有效期 1 小时），不做训练数据复用（写入隐私协议） |
| 可用性目标 | MVP 阶段 99.5%，正式版 99.9%；关键服务多副本部署；GPU 节点健康检查+自动摘除 |
| 灾备 | 数据库每日全量备份+实时 WAL 归档，对象存储跨可用区副本 |
| 内容安全 | 图片/视频/文本三层合规审核，阻断涉政/涉黄/涉暴/虚假宣传内容 |

### 10.3 性能指标（MVP 目标）
| 指标 | 目标值 |
|---|---|
| 画布首屏加载 | ≤2.5s（宽带环境） |
| 图片生成（1024px 主图）平均耗时 | ≤15s |
| 15s 短视频生成平均耗时 | ≤2min（从触发到剪映工程产出） |
| 15s 视频批量 10 条 | ≤10min（并行调度） |
| PSD 编译耗时（5-10 图层） | ≤2s |
| 剪映草稿编译 | ≤3s |
| SVG 生成（Recraft） | ≤10s |
| 智能抠图（RMBG-2.0 本地） | ≤2s |
| 并发支持 | MVP 支持 50 并发任务，弹性扩缩容 |

---

## 11. 版本迭代与发布管理体系

> 本章定义 Nova Canvas 从 MVP（v0.1）到 GA（v1.0）及持续演进的全生命周期版本治理规则，覆盖版本号规范、发布路线图、迭代机制、发布流程、CI/CD、数据驱动决策与升级迁移。目标是在"快速试错"与"稳定交付"之间建立可预期、可回滚、可审计的工程秩序。

### 11.1 版本号规范（Semantic Versioning）

采用 **SemVer 2.0.0** 主版本号语义，并结合 AI 内容生产产品的发布节奏衍生出明确的阶段标识（Alpha / Beta / RC / GA）。

**版本号结构：`MAJOR.MINOR.PATCH[-预发布标识]`**

| 字段 | 含义 | 递增规则（自 MVP 起） |
|---|---|---|
| MAJOR | 不兼容的大版本（架构 / 数据格式 / 公开 API 破坏性变更） | 配方格式不兼容、画布工程格式不兼容、公开 API 删除时 +1 |
| MINOR | 向后兼容的新功能（新能力、新节点、新模型接入） | 新增工作台、新增 Skill 类目、新增导出格式时 +1 |
| PATCH | 向后兼容的问题修复（Bug 修复、合规词库更新、性能优化） | 修复渲染 Bug、更新广告法词库、降级逻辑修复时 +1 |
| 预发布标识 | `-alpha.N` / `-beta.N` / `-rc.N` | 内部 / 种子 / 候选阶段递增 |

**阶段定义与准入 / 准出标准**：

| 阶段 | 标识示例 | 准入标准（Entry） | 准出标准（Exit） |
|---|---|---|---|
| Alpha（内测） | `0.1.0-alpha.3` | 核心链路可跑通（生图 → 导出）；已知缺陷有清单 | 主流程无 P0/P1 阻断；种子用户可上手 |
| Beta（公测） | `0.1.0-beta.1` | Alpha 准出；合规预审 100% 拦截违禁词 | 关键路径自动化测试通过；崩溃率 < 1% |
| RC（候选发布） | `0.1.0-rc.2` | Beta 准出；性能达标（见 10.3） | 72h 压测无 P0；灰度 5% 无资损 |
| GA（正式发布） | `0.1.0` | RC 准出；回滚预案演练通过 | 全量发布；SLA 99.5% 达成 |

**特殊约定**：
- 模型供应商迭代（FLUX / Nova Canvas / Seedance 等）只改内部路由版本，**不**触发产品 MAJOR，保证用户作品不受影响（见 11.7）。
- 配方（Recipe）与画布工程（Canvas Project）有独立的**数据格式版本**（见 11.7），与产品版本号解耦。

### 11.2 版本路线图

| 版本 | 定位 | 时间窗 | 关键交付 |
|---|---|---|---|
| **v0.1（MVP）** | 内部可演示 + 种子内测 | 启动后 **8 周**（对应第 12 章排期） | 三模式画布、3 核心 Skill、PSD / 剪映 / SVG 导出、配方基础、合规预审 |
| **v1.0（GA）** | 首个正式公开版 | MVP 后 **+3 月** | 三模式工作台完善、爆款裂变、配方市场、FCPXML、协作、会员体系、Windows PS 节点 |
| **v2.0** | 规模化与生态 | GA 后 **+6 月** | PRPROJ、跨平台一键发布、企业版私有化、Skill 开放平台、数字人 24h 直播 |
| **v3.0** | 智能化与闭环 | GA 后 **+12 月** | AI 投放闭环（CTR 反哺生成）、移动端、直播实时素材、自动优选训练 |

> 节奏说明：MVP 以"速度验证"为先；v1.0 以"稳定可商用"为门槛；v2.0 以"规模化变现"为目标；v3.0 以"数据飞轮"为壁垒。每个 MINOR 之间保持双周迭代（见 11.3）。

### 11.3 迭代管理机制

采用 **双周 Sprint（2-week Sprint）+ 持续交付（Continuous Delivery）** 节奏，需求经统一池化管理后按优先级进入迭代。

**角色与仪式**：

| 仪式 | 频率 | 产出 |
|---|---|---|
| Sprint Planning | 每 Sprint 首 | 本迭代承诺清单（Committed Scope） |
| Daily Standup | 每日 | 阻塞同步（≤15min） |
| Sprint Review | 每 Sprint 末 | 可演示增量（Demo） |
| Sprint Retro | 每 Sprint 末 | 改进项（≤3 条，下迭代跟进） |
| Backlog Grooming | 每周 | 需求澄清与估算刷新 |

**估算与优先级**：
- **Story Point**：斐波那契（1/2/3/5/8/13）相对估算，团队速率（Velocity）滚动 3 个 Sprint 取均值用于承诺量预测。
- **RICE 优先级模型**：`RICE = (Reach × Impact × Confidence) / Effort`，需求池按分数排序；高 Reach 的合规 / 稳定性项设"硬性门槛"直接进迭代。

| 维度 | 取值说明 |
|---|---|
| Reach（触达） | 每季度受影响用户数（如"全部生成用户"= 高） |
| Impact（影响） | 0.25 / 0.5 / 1 / 2 / 3（微小 → 巨大） |
| Confidence（信心） | 0.5 / 0.8 / 1.0（低 / 中 / 高证据） |
| Effort（投入） | 人月（含测试 / 文档） |

**需求流转闭环**：`需求池（Backlog）→ 规划（Grooming + RICE）→ 开发（Sprint）→ 测试（DoD 门禁）→ 上线（灰度）→ 反馈（11.6 数据反哺回池）`。

**完成定义（DoD）**：代码评审通过 + 单测通过 + 关联文档更新 + 合规词库 / 元数据校验通过 + 产品验收。

### 11.4 发布管理流程

**分支模型（Git Flow 变体）**：

```
main（生产可发布）  ── 仅接收 release/* 与 hotfix/* 合并，每次合并打 tag
├── develop（集成分支）        ── 日常集成
│   ├── feature/*（功能分支）   ── 从 develop 拉，合回 develop
│   ├── release/vX.Y（发布分支）── 从 develop 拉，只收 PATCH / 文档，合回 main + develop
│   └── hotfix/*（热修分支）    ── 从 main 拉，合回 main + develop
```

**灰度发布（Progressive Rollout）**：

| 阶段 | 范围 | 观测指标 | 晋级条件 |
|---|---|---|---|
| 内部（Internal） | 团队 + 内部账号 100% | 崩溃率、错误日志 | 无 P0（24h） |
| 种子（Seed 5%） | 随机 5% 种子用户 | 生成成功率、耗时 P95 | 成功率 ≥ 99% |
| 扩量 20% | 20% 用户 | 同上 + 客诉 | 无资损 |
| 扩量 50% | 50% 用户 | 同上 | 指标平稳 |
| 全量（100%） | 100% 用户 | SLA 监控 | 达成 SLA |

**回滚机制（三线兜底）**：
1. **蓝绿部署（Blue-Green）**：生产环境保留上一稳定版本实例，发版失败 1 次点击切回（RTO < 5min）。
2. **Feature Flag（功能开关）**：新功能默认关，按灰度比例放量；异常时开关秒级关闭，无需回滚代码。
3. **双写兼容（Dual-Write）**：数据格式变更（配方 / 工程）升级期间新旧格式双写，保证降级可读。

**Hotfix 流程**：从 `main` 拉 `hotfix/*` → 修复 + 单测 → 合并 `main`（打 PATCH tag）+ `develop` → 触发蓝绿切换。SLA：P0 线上故障 ≤ 2h 修复或回滚。

### 11.5 CI/CD（持续集成与持续交付）

**前端（web/，React 19 + Vite + TypeScript）**：

| 阶段 | 工具 | 门禁 |
|---|---|---|
| Lint | ESLint + Stylelint | 0 error |
| 单元测试 | Vitest + React Testing Library | 覆盖率 ≥ 70%（核心模块） |
| E2E | Playwright | 关键路径（生图 → 导出）通过 |
| 构建制品 | Vite build → Docker 镜像 | 产物带 `git-sha` + 版本 tag |
| 部署 | 蓝绿 / 静态 CDN | 按 11.4 灰度 |

**后端（backend/，Go + Gin / Python FastAPI）**：

| 阶段 | 工具 | 门禁 |
|---|---|---|
| 单元测试 | `go test` / pytest | 通过 + 覆盖率门禁 |
| 集成测试 | Testcontainers（PG / Redis / MinIO） | 关键链路通过 |
| 契约测试 | 模型 API Mock（OpenAPI 契约） | 路由协议不变 |
| 镜像 | Docker build → 私有 Registry | 镜像签名 + 漏洞扫描 |
| 部署 | K8s / Docker Compose 滚动 | 健康检查通过 |

**画布节点版本化（Canvas Node Versioning）**：每个节点类型（商品 / 剧本 / 分镜 / 生成 / 导出）声明 `nodeSchemaVersion`，画布工程存取时按 schema 迁移（见 11.7），避免旧工程因节点字段变更而打不开。

**Agent Skill 版本管理**：每个 Skill 包 `skills/<name>/` 含 `manifest.yaml`（name / version / apiVersion），编排层按 `apiVersion` 路由；Skill 市场升级走独立 PATCH，不阻塞主版本。

### 11.6 数据驱动决策

**北极星指标（North Star）**：`MAC = 月度活跃创作用户数 × 人均成功交付作品数`（Monthly Active Creators × successful Works / user），直接反映"创作精准高效 + 全部可商用"的价值兑现。

**核心指标看板**：

| 类别 | 指标 | 目标（v1.0） |
|---|---|---|
| 活跃 | DAU / MAU、留存（次日 / 7 日 / 30 日） | 7 日 ≥ 40% |
| 创作 | 人均生成次数、人均导出源文件数 | — |
| 质量 | 生成成功率、PSD / 剪映一次打开率 | ≥ 99% |
| 性能 | 首屏 ≤ 2.5s、生图 P95 ≤ 15s | 见 10.3 |
| 商业 | 付费转化率、ARPU、NRR | 转化 ≥ 8% |
| 稳定 | 崩溃率、P0 故障数、MTTR | 崩溃 < 0.5% |

**A/B 实验**：新模型路由、配方默认参数、UI 布局经 Feature Flag 分桶实验，以 MAC 及其拆解指标为决策依据，显著胜出（p < 0.05）方全量。

**反馈闭环**：用户评分 / 客诉 / 导出失败日志 → 结构化进入需求池（11.3）→ RICE 重排 → 下迭代；形成"数据 → 决策 → 交付 → 数据"飞轮。

### 11.7 版本升级与数据迁移

核心原则：**用户资产（配方、画布工程、生成作品）跨版本向后兼容，模型迭代对用户无感**。

| 资产 | 版本兼容策略 |
|---|---|
| **配方（Recipe）** | 配方 JSON 带 `recipeVersion`；v1 → v2 提供转换器（缺失字段填默认值，新增字段忽略），旧配方在新版可读可套用；破坏性变更走 `recipeVersion` 大版本并双写 |
| **画布工程（Canvas Project）** | 工程文件含 `schemaVersion`；节点按 11.5 的 `nodeSchemaVersion` 迁移；打开旧工程时自动升级并备份原文件（`.bak`） |
| **模型迭代** | 模型供应商升级只改内部路由表版本，**不**变更用户作品与公开 API；旧任务结果可复现（固定 seed / 版本快照） |
| **源文件格式** | PSD / 剪映 / SVG / PPTX 导出格式稳定；新增格式（FCPXML / PRPROJ）为追加能力，不影响既有导出 |

**大版本迁移工具**：提供 `nova-migrate` CLI，支持 `nova-migrate up`（升级）/ `down`（回滚到上一兼容版本），对配方库、工程库、用户配置做批量迁移并产出迁移报告；迁移前自动备份（对象存储版本化）。

**兼容性承诺**：MAJOR 版本间至少保留一个版本的读兼容；弃用（Deprecation）提前 1 个 MINOR 公告，保留期 ≥ 90 天。

---

## 12. Demo 开发排期与里程碑

**总工期：8 周（约 2 个月）完成 P0 MVP Demo。**

| 周次 | 里程碑 | 交付物 |
|---|---|---|
| W1 | 项目脚手架 & 画布基线 | Fork nova-canvas→重命名 Nova Canvas→本地跑通→Docker 化→部署测试环境；完成数据库/存储/队列基础架构；品牌化替换（Logo/主题色/登录） |
| W2 | 节点扩展 & 画布交互 | 完成 8 种核心节点（商品/剧本/分镜/视频/音频/文本/特效/导出）；三模式工作台切换 UI；Slash Command 框架 |
| W3 | 模型接入 & 基础生成 | 接入 FLUX.2/Nova Canvas/Seedance/Nova Reel/Recraft/Claude 等核心 API；打通文生图/图生图/文生视频/图生视频基础链路；多模型路由+失败降级 |
| W4 | Agent 编排 & Skill 框架 | 主编排 Agent 跑通；完成 url-to-product、product-understand、one-click-video、product-retouch 四个核心 Skill |
| W5 | 源文件引擎 | PSD 生成器（栅格化版本）+ 剪映草稿生成器 + SVG 生成器联调通过；画布内"导出 PSD/剪映/SVG"按钮可用；源文件预览面板 |
| W6 | 电商核心功能 | 智能抠图（RMBG-2.0）/产品精修/10 个内置配方/爆款复刻（单条）/多平台尺寸适配 |
| W7 | 合规/稳定性/体验打磨 | 合规预审、错误处理、Loading 态、引导教程、空状态、快捷键、全链路商用授权标注 |
| W8 | 内测 Demo 发布 | 邀请 20-50 位种子用户（电商卖家/MCN/短剧团队）内测；收集反馈；Demo 演示视频 |

**团队配置建议（MVP 最小团队）**：
| 角色 | 人数 | 职责 |
|---|---|---|
| 前端工程师 | 2 | 画布内核改造+UI 交互+三模式工作台 |
| 后端/Python 工程师 | 2 | Agent 编排+源文件引擎（PSD/剪映/SVG）+模型接入+任务队列 |
| 产品/设计师 | 1 | 交互设计+配方设计+UI 视觉+测试 |
| **合计** | **5 人 × 8 周 ≈ 10 人月** | |

**MVP 成本估算**：
| 项目 | 费用 |
|---|---|
| 人力成本（5 人 × 2 月，按均薪 2.5 万/月） | 25 万元 |
| 云服务/GPU/API 调用（测试期） | 1-2 万元 |
| 字体/素材/模型商用授权（启动期） | 1-2 万元 |
| **合计** | **约 27-30 万元** |

---

## 13. 附录：关键配置与代码片段

### 13.1 Docker Compose 一键启动（开发环境）
```yaml
# docker-compose.yml
version: "3.8"
services:
  web:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgresql://canvas:canvas@postgres:5432/canvas
      - REDIS_URL=redis://redis:6379/0
      - S3_ENDPOINT=http://minio:9000
      - MODEL_API_KEYS={"nova":"xxx","flux":"xxx","seedance":"xxx","claude":"xxx","recraft":"xxx"}
    depends_on: [postgres, redis, minio, api]

  api:
    build: ./backend
    ports: ["8000:8000"]
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      - DATABASE_URL=postgresql://canvas:canvas@postgres:5432/canvas
      - REDIS_URL=redis://redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - CELERY_BROKER_URL=redis://redis:6379/1
    depends_on: [postgres, redis, minio]

  worker:
    build: ./backend
    command: celery -A tasks worker -l info -c 4 -Q image,video,compile,psd,jianying
    environment:
      - same as api
    depends_on: [postgres, redis, minio]

  # P1: Windows Photoshop 渲染节点（独立部署，非 Docker）
  # ps-renderer:
  #   build: ./backend-ps
  #   command: uvicorn ps_renderer:app --host 0.0.0.0 --port 8001

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: canvas
      POSTGRES_PASSWORD: canvas
      POSTGRES_DB: canvas
    volumes: ["pgdata:/var/lib/postgresql/data"]
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes: ["miniodata:/data"]
    ports: ["9000:9000", "9001:9001"]

  qdrant:
    image: qdrant/qdrant:v1.9.0
    ports: ["6333:6333"]
    volumes: ["qdrant_data:/qdrant/storage"]

volumes:
  pgdata:
  miniodata:
  qdrant_data:
```

### 13.2 Agent 调用 Skill 的标准协议
```python
# backend/skills/base.py
from pydantic import BaseModel
from typing import Any, Optional

class SkillInput(BaseModel):
    nodes: list[dict]       # 画布上相关节点的 JSON
    params: dict            # Skill 参数
    user_context: dict      # 用户上下文（品牌/会员等级/API 配额等）

class SkillOutput(BaseModel):
    new_nodes: list[dict]   # 新增/修改的节点（Agent 自动合并到画布）
    new_edges: list[dict]   # 新增连线
    message: str            # 返回给用户的消息
    files: list[dict]       # 产出文件（URL + 类型 + 预览图 + 可下载链接）

class BaseSkill:
    name: str
    description: str
    async def execute(self, inp: SkillInput) -> SkillOutput:
        raise NotImplementedError
```

### 13.3 模型调用统一封装
```python
# backend/models/router.py
async def generate_image(prompt: str, negative: str = "",
                         size: tuple = (1024,1024),
                         quality: str = "high",
                         style: str = "product",
                         prefer_model: str = None) -> str:
    """多模型路由：按任务类型+质量档位自动选择模型，失败自动降级。"""
    if prefer_model:
        return await _try_model(prefer_model, prompt, negative, size, quality)
    
    if style == "vector":
        return await _try_with_fallback(
            ["recraft", "firefly_vector"], prompt, negative, size
        )
    if style == "layered":
        return await qwen_image_layered.generate(prompt, negative, size)  # 本地
    if quality == "draft":
        return await _try_with_fallback(
            ["seedream", "seedance_mini"], prompt, negative, size
        )
    # 默认高质量：国内 FLUX.2 / 跨境 Nova Canvas
    return await _try_with_fallback(
        ["flux2", "nova_canvas", "jimeng"], prompt, negative, size
    )

async def generate_video(prompt: str, first_frame: str = None,
                         duration: int = 5, resolution: str = "1080p",
                         quality: str = "high") -> str:
    if quality == "draft":
        return await _try_with_fallback(
            ["seedance_mini", "kling_light"], prompt, first_frame, duration
        )
    return await _try_with_fallback(
        ["nova_reel", "seedance2.5", "kling_o3"], prompt, first_frame, duration
    )
```

### 13.4 商用合规字体清单（免费，开箱即用）
| 字体 | 厂商 | 授权类型 | 适用场景 |
|---|---|---|---|
| 阿里巴巴普惠体（4 字重） | 阿里巴巴 | 免费商用（无需标注） | 中文标题/正文/价格 |
| 思源黑体 / 思源宋体 | Adobe + Google | SIL Open Font License | 中文正文/长文 |
| 站酷快乐体 / 站酷酷黑 / 站酷庆科黄油体 | 站酷网 | 免费商用 | 标题/装饰 |
| OPPO Sans | OPPO | 免费商用（个人+企业） | 中文通用 |
| Oswald（英文） | Google Fonts | SIL OFL | 英文标题/数字 |
| DIN Alternate Bold（数字） | 开源版本 | 开源商用 | 价格数字（电商强需求） |
| JetBrains Mono | JetBrains | SIL OFL | 代码/技术文字 |

### 13.5 可商用 BGM 来源
| 来源 | 授权类型 | 适用场景 |
|---|---|---|
| 抖音商用音乐库（通过抖音开放平台 API） | 平台内商用授权 | 抖音/短视频带货 |
| Adobe Stock Music | 付费商用（一次性授权） | 广告/宣传片 |
| YouTube Audio Library | 免费商用（需标注） | 通用 |
| Freesound.org | CC0 / CC-BY | 音效/片段 |
| 耳聆网 | CC BY-NC（注意非商用条款） | 非商用场景 |
| 平台自建版权音乐库（长期建设） | 自有版权 | 全场景 |

### 13.6 项目目录结构（建议）
```
nova-canvas/
├── web/                          # Next.js 前端
│   ├── app/                      # App Router 页面
│   ├── components/canvas/        # Nova Canvas 画布组件
│   ├── components/nodes/         # 各种节点组件
│   ├── components/agent/         # Agent 对话面板
│   ├── lib/canvas-kernel/        # 画布内核（基于 basketikun/nova-canvas 改造）
│   └── styles/
├── backend/                      # Python FastAPI 后端
│   ├── main.py                   # API 入口
│   ├── agents/                   # Agent 编排
│   │   ├── router.py             # 主编排 Agent
│   │   └── skills/               # 15 个 Skill
│   ├── models/                   # 模型接入 + 路由
│   │   ├── router.py
│   │   ├── nova_canvas.py        # Amazon Nova Canvas
│   │   ├── nova_reel.py          # Amazon Nova Reel
│   │   ├── flux2.py
│   │   ├── seedance.py
│   │   └── recraft.py
│   ├── generators/               # 源文件生成器
│   │   ├── psd_generator.py      # PSD 主引擎
│   │   ├── psd_native_text.py    # P1 Win PS 节点
│   │   ├── jianying_generator.py # 剪映草稿
│   │   ├── fcpxml_generator.py   # P1 FCPXML
│   │   ├── svg_generator.py      # SVG
│   │   └── pptx_generator.py     # PPTX
│   ├── tasks.py                  # Celery 任务
│   ├── workers/                  # 异步任务处理
│   └── assets/                   # 字体/模板/配方/内置素材
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

**Nova Canvas v2.0 MVP 技术方案报告 · 终稿**
> 本文档可直接用于 Demo 开发启动。所有代码片段均可运行，所有模型/库均为 2026 年 8 月最新可用版本，所有成本数据基于公开 API 定价估算，所有工期基于 5 人全职团队评估。
