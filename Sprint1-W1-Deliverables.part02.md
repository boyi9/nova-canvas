compat,兼容性改造,#B08800,涉及infinite-canvas原生能力兼容的任务,Story;Task
security,安全相关,#DE350B,涉及沙箱隔离、权限控制、数据加密的任务,Story;Task
deploy,部署相关,#36B37E,涉及Docker、Render、灰度发布的任务,Story;Task
test,测试相关,#FFC400,涉及单测、集成测、压测、跨平台验证的任务,Story;Task
docs,文档相关,#8777D9,涉及用户手册、开发文档、部署指引的任务,Story;Task
compliance,合规相关,#00A3E0,涉及开源协议、许可证、隐私合规的任务,Story;Task
mcp,MCP协议相关,#6554C0,涉及MCP Server/Client/Tool实现的任务,Story;Task
script,脚本相关,#FF8B00,涉及自定义脚本配置、沙箱、调度的任务,Story;Task
cross-platform,跨平台相关,#00875A,涉及Windows/macOS/Linux适配的任务,Story;Task
ux,用户体验相关,#00B8D9,涉及交互流程优化、操作步骤简化的任务,Story;Task
render,渲染引擎相关,#6554C0,涉及画布渲染性能、架构适配的任务,Story;Task
state,状态管理相关,#00875A,涉及撤销重做、持久化、状态同步的任务,Story;Task
migration,迁移相关,#FF5630,涉及历史数据迁移、版本升级的任务,Story;Task
framework,框架相关,#0065FF,涉及基础框架搭建、核心架构的任务,Story;Task
lifecycle,生命周期相关,#00B8D9,涉及安装/启用/更新/卸载状态机的任务,Story;Task
hot-reload,热加载相关,#6554C0,涉及代码热更新、无刷新生效的任务,Story;Task
adapter,适配器相关,#00875A,涉及多后端统一适配接口的任务,Story;Task
t2i,文生图相关,#FF8B00,涉及Text-to-Image生成能力的任务,Story;Task
i2i,图生图相关,#FF8B00,涉及Image-to-Image生成能力的任务,Story;Task
edit,编辑能力相关,#00B8D9,涉及参考图编辑、局部重绘能力的任务,Story;Task
chat,对话能力相关,#6554C0,涉及文本问答、对话上下文的任务,Story;Task
audio,音频生成相关,#FF5630,涉及音频生成能力的任务,Story;Task
video,视频生成相关,#DE350B,涉及视频生成能力的任务,Story;Task
circuit-breaker,熔断器相关,#0065FF,涉及熔断降级、高可用架构的任务,Story;Task
monitor,监控相关,#36B37E,涉及指标采集、告警配置、大盘搭建的任务,Story;Task
ui,界面相关,#8777D9,涉及前端UI组件、交互实现的任务,Story;Task
sandbox,沙箱相关,#FF5630,涉及隔离执行环境、权限控制的任务,Story;Task
scheduler,调度相关,#0065FF,涉及任务调度、队列管理的任务,Story;Task
marketplace,市场相关,#FF8B00,涉及脚本/插件市场、上架分成的任务,Story;Task
context,上下文相关,#00875A,涉及节点上下文提取、Prompt构建的任务,Story;Task
types,类型定义相关,#8777D9,涉及TypeScript类型定义、接口契约的任务,Story;Task
server,服务端相关,#0065FF,涉及MCP Server实现、能力协商的任务,Story;Task
tools,工具集相关,#00B8D9,涉及MCP Tool定义、画布操作工具的任务,Story;Task
codex,Codex相关,#6554C0,涉及Codex App插件适配的任务,Story;Task
claude,Claude Code相关,#FF8B00,涉及Claude Code适配的任务,Story;Task
windows,Windows平台相关,#00B8D9,涉及Windows专项适配的任务,Story;Task
macos,macOS平台相关,#6554C0,涉及macOS专项适配的任务,Story;Task
linux,Linux平台相关,#FF5630,涉及Linux专项适配的任务,Story;Task
example,示例相关,#DE350B,涉及示例代码、快速上手指引的任务,Story;Task
permission,权限相关,#0065FF,涉及权限声明、申请、校验的任务,Story;Task
sync,同步相关,#00875A,涉及数据同步、增量更新的任务,Story;Task
indexeddb,IndexedDB相关,#00B8D9,涉及本地数据库缓存、存储优化的任务,Story;Task
search,检索相关,#6554C0,涉及全文检索、语义搜索的任务,Story;Task
perf,性能相关,#DE350B,涉及性能优化、响应时延指标的任务,Story;Task
license,许可证相关,#FF8B00,涉及开源许可证扫描、合规台账的任务,Story;Task
upstream,上游社区相关,#00875A,涉及代码回流上游、社区协作的任务,Story;Task
shortcuts,快捷键相关,#00B8D9,涉及快捷键体系、操作手册的任务,Story;Task
prod,生产环境相关,#0065FF,涉及生产环境优化、部署的任务,Story;Task
canary,灰度发布相关,#FF5630,涉及灰度策略、流量切换的任务,Story;Task
stress,压力测试相关,#DE350B,涉及压测场景、性能基线的任务,Story;Task
rollback,回滚相关,#FF8B00,涉及回滚预案、演练验证的任务,Story;Task
oncall,值守相关,#0065FF,涉及上线值守、轮班安排的任务,Story;Task
baseline,基线相关,#8777D9,涉及测试基线建立、回归对比的任务,Story;Task
automation,自动化相关,#0065FF,涉及测试自动化、流水线的任务,Story;Task
regression,回归测试相关,#00875A,涉及回归测试用例、验证的任务,Story;Task
analysis,分析相关,#6554C0,涉及架构分析、技术调研的任务,Story;Task
merge,合并相关,#FF5630,涉及代码合并、冲突处理的任务,Story;Task
github-actions,GitHub Actions相关,#0065FF,涉及GitHub Actions CI/CD配置的任务,Story;Task
~~~

## 1.5 Sprints

~~~csv
Sprint ID,Sprint Name,Goal,Start Date,End Date,Status,Capacity (Story Points),Committed Story Points
SPRINT-1,Sprint 1: 基础设施与画布核心,"搭建CI/CD、开发环境、回归测试基线；完成infinite-canvas画布核心能力兼容改造；MCP协议对接层基础封装；远程插件安装基础框架",2025-01-06,2025-02-02,To Do,55,53
SPRINT-2,Sprint 2: 核心功能开发,"多OpenAI兼容接口调度、自定义生图脚本、画布助手对话生图、跨平台Agent适配、SDK文档、插件沙箱安全、提示词库缓存",2025-02-03,2025-03-02,To Do,70,68
SPRINT-3,Sprint 3: 测试验收上线,"全场景集成测试、开源合规梳理、文档完善、Docker/Render部署、灰度发布、正式上线72小时值守",2025-03-03,2025-03-28,To Do,55,52
~~~

## 1.6 Jira 导入文件

~~~json
{
  "version": "v1.0-20250101",
  "exportedAt": "2025-01-16T00:00:00Z",
  "source": "Nova Canvas Phase 1 Planning",
  "projects": [
    {
      "projectKey": "NOVA",
      "projectName": "Nova Canvas",
      "projectType": "software",
      "lead": "project-manager",
      "description": "一站式多场景AI创意内容生产平台 - 基于infinite-canvas二次开发"
    }
  ],
  "epics": [
    {"key": "EPIC-CANVAS", "name": "核心画布能力", "summary": "兼容infinite-canvas原生多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出全部原有能力", "priority": "Highest", "status": "To Do", "startDate": "2025-01-06", "endDate": "2025-02-28", "labels": ["canvas", "p0", "compat"]},
    {"key": "EPIC-AI", "name": "AI创作能力", "summary": "保留原生浏览器前台直连OpenAI兼容接口能力，文生图、图生图、参考图编辑、文本问答、音频和视频生成五类核心能力", "priority": "Highest", "status": "To Do", "startDate": "2025-01-13", "endDate": "2025-02-14", "labels": ["ai", "p0"]},
    {"key": "EPIC-AGENT", "name": "画布助手与Agent能力", "summary": "围绕选中节点和上游节点对话、生图功能可用，生成结果可直接一键插回当前画布", "priority": "Highest", "status": "To Do", "startDate": "2025-01-20", "endDate": "2025-03-07", "labels": ["agent", "p0", "mcp"]},
    {"key": "EPIC-PLUGIN", "name": "插件系统", "summary": "远程节点插件的URL动态安装/启用/更新/卸载全流程可用，配套TypeScript SDK开发文档完整", "priority": "Highest", "status": "To Do", "startDate": "2025-01-27", "endDate": "2025-03-14", "labels": ["plugin", "p0", "sdk"]},
    {"key": "EPIC-PROMPT", "name": "提示词库", "summary": "前端直连多个GitHub开源提示词项目，所有提示词资源可自动缓存到IndexedDB，本地离线访问可用率100%", "priority": "High", "status": "To Do", "startDate": "2025-02-10", "endDate": "2025-03-21", "labels": ["prompt", "p1", "cache"]},
    {"key": "EPIC-INFRA", "name": "基础部署与合规", "summary": "保留原有Docker部署方案，用户配置本地加密存储，开源协议合规梳理", "priority": "Highest", "status": "To Do", "startDate": "2025-01-06", "endDate": "2025-03-28", "labels": ["infra", "p0", "deploy", "compliance"]}
  ],
  "stories": [
    {"key": "CANVAS-001", "epicKey": "EPIC-CANVAS", "summary": "原有画布核心能力兼容性改造", "description": "兼容infinite-canvas原生多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出全部原有能力，原有功能通过率100%，历史创建的画布项目可无缝迁移导入", "acceptanceCriteria": "原有功能通过率100%|历史画布无缝迁移导入|画布节点操作手册/快捷键体系同步更新", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-1", "assigneeRole": "前端开发", "labels": ["canvas", "p0", "compat"], "dependencies": ["INFRA-001", "INFRA-002"]},
    {"key": "CANVAS-002", "epicKey": "EPIC-CANVAS", "summary": "画布操作手册与快捷键文档更新", "description": "更新画布节点操作手册、快捷键体系同步完成适配更新，与新版功能完全匹配", "acceptanceCriteria": "手册覆盖所有新功能|快捷键无冲突|中英文对照", "priority": "High", "storyPoints": 3, "sprint": "SPRINT-3", "assigneeRole": "产品经理", "labels": ["docs", "canvas", "p1", "shortcuts"], "dependencies": ["CANVAS-001"]},
    {"key": "AI-001", "epicKey": "EPIC-AI", "summary": "多OpenAI兼容接口调度能力开发", "description": "保留原生浏览器前台直连OpenAI兼容接口能力，文生图、图生图、参考图编辑、文本问答、音频和视频生成五类核心能力调用成功率≥98%", "acceptanceCriteria": "五类能力调用成功率≥98%|自动熔断降级|请求耗时P99<30s", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-2", "assigneeRole": "全栈/后端开发", "labels": ["ai", "api", "p0", "adapter"], "dependencies": ["INFRA-003"]},
    {"key": "AI-002", "epicKey": "EPIC-AI", "summary": "自定义生图脚本调用能力开发", "description": "自定义生图/视频接口调用脚本配置功能上线，支持灵活适配各类中转站与自建服务，用户可自行上传配置脚本完成私有服务对接", "acceptanceCriteria": "脚本配置UI可用|中转站/自建服务对接成功|脚本沙箱隔离", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-2", "assigneeRole": "后端开发", "labels": ["ai", "script", "security", "p0", "sandbox"], "dependencies": ["AI-001", "PLUGIN-003"]},
    {"key": "AGENT-001", "epicKey": "EPIC-AGENT", "summary": "MCP协议对接层基础封装", "description": "本地Canvas Agent通过MCP协议对接Codex / Claude Code的调通率100%，可实现Agent直接操作当前画布的全流程闭环", "acceptanceCriteria": "MCP协议对接率100%|Agent操作画布闭环|Codex/Claude Code双适配", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-1", "assigneeRole": "后端开发", "labels": ["agent", "mcp", "p0", "server"], "dependencies": ["INFRA-003"]},
    {"key": "AGENT-002", "epicKey": "EPIC-AGENT", "summary": "画布助手对话生图插回画布能力开发", "description": "围绕选中节点和上游节点对话、生图功能可用，生成结果可直接一键插回当前画布，操作路径不超过2步", "acceptanceCriteria": "选中节点上下文注入|生图结果一键插回|操作路径≤2步", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-2", "assigneeRole": "前端+后端开发", "labels": ["agent", "canvas", "p0", "context", "ux"], "dependencies": ["AGENT-001", "AI-001"]},
    {"key": "AGENT-003", "epicKey": "EPIC-AGENT", "summary": "跨平台本地Agent兼容性适配", "description": "Codex App插件完成适配，安装后可自动注册MCP并拉起本地Agent，引导流程完整通顺，Windows/macOS/Linux三平台验证", "acceptanceCriteria": "三平台各50次全流程验证通过|端口冲突自动解决|权限路径自动适配", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-2", "assigneeRole": "后端开发", "labels": ["agent", "cross-platform", "p0", "windows", "macos", "linux"], "dependencies": ["AGENT-001"]},
    {"key": "PLUGIN-001", "epicKey": "EPIC-PLUGIN", "summary": "远程插件安装基础框架搭建", "description": "远程节点插件的URL动态安装/启用/更新/卸载全流程可用", "acceptanceCriteria": "安装/启用/更新/卸载全流程可用|插件热加载无刷新", "priority": "Highest", "storyPoints": 5, "sprint": "SPRINT-1", "assigneeRole": "前端开发", "labels": ["plugin", "framework", "p0", "lifecycle"], "dependencies": ["INFRA-003"]},
    {"key": "PLUGIN-002", "epicKey": "EPIC-PLUGIN", "summary": "TypeScript SDK开发文档输出", "description": "配套的TypeScript SDK开发文档完整，开发者可基于SDK在30分钟内完成简单自定义插件开发", "acceptanceCriteria": "SDK文档完整|30分钟快速上手|示例插件可运行", "priority": "High", "storyPoints": 5, "sprint": "SPRINT-2", "assigneeRole": "前端开发", "labels": ["plugin", "sdk", "docs", "p1", "example"], "dependencies": ["PLUGIN-001"]},
    {"key": "PLUGIN-003", "epicKey": "EPIC-PLUGIN", "summary": "插件沙箱安全能力开发", "description": "所有插件运行在隔离iframe环境，默认禁止插件直接访问浏览器本地存储，新增插件权限申请校验机制", "acceptanceCriteria": "沙箱隔离生效|本地存储访问拦截|权限申请校验通过", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-2", "assigneeRole": "后端开发", "labels": ["plugin", "security", "p0", "sandbox", "permission"], "dependencies": ["PLUGIN-001"]},
    {"key": "PROMPT-001", "epicKey": "EPIC-PROMPT", "summary": "提示词库联网缓存能力开发", "description": "前端直连多个GitHub开源提示词项目，所有提示词资源可自动缓存到IndexedDB，本地离线访问可用率100%，检索响应耗时≤200ms", "acceptanceCriteria": "多源同步缓存|离线可用率100%|检索≤200ms|自动淘汰策略", "priority": "High", "storyPoints": 5, "sprint": "SPRINT-2", "assigneeRole": "前端开发", "labels": ["prompt", "cache", "p1", "indexeddb", "search", "perf"], "dependencies": ["INFRA-003"]},
    {"key": "INFRA-001", "epicKey": "EPIC-INFRA", "summary": "开源仓库主干分支同步CI流水线搭建", "description": "建立每日自动同步上游主库的CI流水线，每日凌晨自动合并上游最新提交到开发分支，跑通全量回归测试", "acceptanceCriteria": "每日自动同步|全量回归测试通过|冲突自动报警", "priority": "Highest", "storyPoints": 3, "sprint": "SPRINT-1", "assigneeRole": "全栈/后端开发", "labels": ["infra", "ci", "p0", "github-actions", "merge"], "dependencies": []},
    {"key": "INFRA-002", "epicKey": "EPIC-INFRA", "summary": "原有infinite-canvas全量用例回归验证", "description": "先完整拉取原生仓库全量单元测试用例，改造前后跑通全量回归测试", "acceptanceCriteria": "全量单测用例拉取|回归测试100%通过", "priority": "Highest", "storyPoints": 5, "sprint": "SPRINT-1", "assigneeRole": "测试/开发", "labels": ["infra", "test", "p0", "regression", "baseline"], "dependencies": ["INFRA-001"]},
    {"key": "INFRA-003", "epicKey": "EPIC-INFRA", "summary": "开发环境、自动化测试环境部署完成", "description": "保留原有Docker部署方案，默认3000端口启动服务可用，配套Render部署指引更新完成", "acceptanceCriteria": "Docker一键启动|3000端口可用|Render指引更新", "priority": "Highest", "storyPoints": 5, "sprint": "SPRINT-1", "assigneeRole": "运维/开发", "labels": ["infra", "deploy", "p0", "docker"], "dependencies": []},
    {"key": "INFRA-004", "epicKey": "EPIC-INFRA", "summary": "全场景集成测试用例执行，bug闭环", "description": "开发阶段提前在三类操作系统各做至少50次全流程验证，提前适配不同系统的端口占用、权限路径差异", "acceptanceCriteria": "集成测试100%通过|Bug零遗留|三平台各50次验证", "priority": "Highest", "storyPoints": 8, "sprint": "SPRINT-3", "assigneeRole": "测试工程师", "labels": ["infra", "test", "p0", "cross-platform", "stress"], "dependencies": ["ALL"]},
    {"key": "INFRA-005", "epicKey": "EPIC-INFRA", "summary": "开源协议合规全量梳理检查", "description": "安排专人梳理所有开源依赖的许可协议，所有分发页面保留原作者信息和开源标识，同步把修改后的代码回流上游开源社区", "acceptanceCriteria": "依赖许可协议台账|原作者信息保留|代码回流上游", "priority": "Highest", "storyPoints": 5, "sprint": "SPRINT-3", "assigneeRole": "产品+法务", "labels": ["infra", "compliance", "p0", "license", "upstream"], "dependencies": []},
    {"key": "INFRA-006", "epicKey": "EPIC-INFRA", "summary": "全量灰度测试，线上环境压力验证", "description": "全量灰度测试，线上环境压力验证", "acceptanceCriteria": "灰度流量10%→50%→100%|核心指标达标|回滚预案就绪", "priority": "Highest", "storyPoints": 5, "sprint": "SPRINT-3", "assigneeRole": "全团队", "labels": ["infra", "release", "p0", "canary", "stress"], "dependencies": ["INFRA-004", "INFRA-005"]},
    {"key": "INFRA-007", "epicKey": "EPIC-INFRA", "summary": "正式版本发布上线，上线后72小时值守", "description": "正式版本发布上线，上线后72小时值守", "acceptanceCriteria": "发布上线|72小时值守零P0|监控大盘正常", "priority": "Highest", "storyPoints": 3, "sprint": "SPRINT-3", "assigneeRole": "全团队", "labels": ["infra", "release", "p0", "oncall"], "dependencies": ["INFRA-006"]},
    {"key": "DEPLOY-001", "epicKey": "EPIC-INFRA", "summary": "Docker、Render部署脚本与指引更新", "description": "所有用户配置的AI API Key、Base URL、画布素材、生成记录默认本地加密存储，无明文上传云端行为，符合数据安全规范", "acceptanceCriteria": "Docker/Render部署可用|本地加密存储|无明文上传", "priority": "Highest", "storyPoints": 3, "sprint": "SPRINT-3", "assigneeRole": "运维/开发", "labels": ["deploy", "security", "p0", "prod"], "dependencies": ["INFRA-003"]}
  ],
  "tasks": [],
  "sprints": [
    {"id": "SPRINT-1", "name": "Sprint 1: 基础设施与画布核心", "goal": "搭建CI/CD、开发环境、回归测试基线；完成infinite-canvas画布核心能力兼容改造；MCP协议对接层基础封装；远程插件安装基础框架", "startDate": "2025-01-06", "endDate": "2025-02-02", "status": "To Do", "capacity": 55, "committed": 53},
    {"id": "SPRINT-2", "name": "Sprint 2: 核心功能开发", "goal": "多OpenAI兼容接口调度、自定义生图脚本、画布助手对话生图、跨平台Agent适配、SDK文档、插件沙箱安全、提示词库缓存", "startDate": "2025-02-03", "endDate": "2025-03-02", "status": "To Do", "capacity": 70, "committed": 68},
    {"id": "SPRINT-3", "name": "Sprint 3: 测试验收上线", "goal": "全场景集成测试、开源合规梳理、文档完善、Docker/Render部署、灰度发布、正式上线72小时值守", "startDate": "2025-03-03", "endDate": "2025-03-28", "status": "To Do", "capacity": 55, "committed": 52}
  ],
  "labels": []
}
~~~

## 1.7 GitHub Projects 导入文件

~~~json
{
  "version": "v1.0-20250101",
  "format": "github-projects-v2",
  "project": {
    "title": "Nova Canvas Phase 1",
    "shortDescription": "一站式多场景AI创意内容生产平台 - 基于infinite-canvas二次开发",
    "readme": "# Nova Canvas Phase 1\n\n基于 infinite-canvas (MIT) 二次开发的全场景 AI 创意内容生产平台。\n\n## 核心目标\n- 兼容 infinite-canvas 100% 原生能力\n- 新增 AI 创作、Agent 智能体、插件系统、提示词库\n- 保持 MIT 开源协议，本地优先，数据安全\n\n## 3 个月 / 3 个 Sprint 交付计划",
    "fields": [
      {"name": "Epic", "dataType": "TEXT", "options": ["EPIC-CANVAS", "EPIC-AI", "EPIC-AGENT", "EPIC-PLUGIN", "EPIC-PROMPT", "EPIC-INFRA"]},
      {"name": "Story Points", "dataType": "NUMBER"},
      {"name": "Priority", "dataType": "SINGLE_SELECT", "options": ["P0-必须交付", "P1-重要但可延后"]},
      {"name": "Sprint", "dataType": "SINGLE_SELECT", "options": ["SPRINT-1", "SPRINT-2", "SPRINT-3"]},
      {"name": "Assignee Role", "dataType": "TEXT"},
      {"name": "Labels", "dataType": "MULTI_SELECT", "options": ["canvas", "ai", "agent", "plugin", "prompt", "infra", "compat", "security", "deploy", "test", "docs", "compliance", "mcp", "script", "cross-platform", "ux", "sdk", "p0", "p1"]},
      {"name": "Dependencies", "dataType": "TEXT"},
      {"name": "Acceptance Criteria", "dataType": "TEXT"}
    ],
    "views": [
      {"name": "By Epic", "groupBy": "Epic", "sortBy": ["Priority", "Story Points"]},
      {"name": "By Sprint", "groupBy": "Sprint", "sortBy": ["Priority", "Story Points"]},
      {"name": "By Priority", "groupBy": "Priority", "sortBy": ["Story Points"]},
      {"name": "Board View", "layout": "board", "groupBy": "Status", "columns": ["To Do", "In Progress", "In Review", "Done"]}
    ],
    "items": [
      {"type": "EPIC", "id": "EPIC-CANVAS", "title": "核心画布能力", "fields": {"Epic": "EPIC-CANVAS", "Priority": "P0-必须交付", "Labels": ["canvas", "p0", "compat"]}},
      {"type": "EPIC", "id": "EPIC-AI", "title": "AI创作能力", "fields": {"Epic": "EPIC-AI", "Priority": "P0-必须交付", "Labels": ["ai", "p0"]}},
      {"type": "EPIC", "id": "EPIC-AGENT", "title": "画布助手与Agent能力", "fields": {"Epic": "EPIC-AGENT", "Priority": "P0-必须交付", "Labels": ["agent", "p0", "mcp"]}},
      {"type": "EPIC", "id": "EPIC-PLUGIN", "title": "插件系统", "fields": {"Epic": "EPIC-PLUGIN", "Priority": "P0-必须交付", "Labels": ["plugin", "p0", "sdk"]}},
      {"type": "EPIC", "id": "EPIC-PROMPT", "title": "提示词库", "fields": {"Epic": "EPIC-PROMPT", "Priority": "P1-重要但可延后", "Labels": ["prompt", "p1", "cache"]}},
      {"type": "EPIC", "id": "EPIC-INFRA", "title": "基础部署与合规", "fields": {"Epic": "EPIC-INFRA", "Priority": "P0-必须交付", "Labels": ["infra", "p0", "deploy", "compliance"]}}
    ],
    "sprints": [
      {"id": "SPRINT-1", "title": "Sprint 1: 基础设施与画布核心", "startDate": "2025-01-06", "endDate": "2025-02-02", "goal": "搭建CI/CD、开发环境、回归测试基线；完成infinite-canvas画布核心能力兼容改造；MCP协议对接层基础封装；远程插件安装基础框架"},
      {"id": "SPRINT-2", "title": "Sprint 2: 核心功能开发", "startDate": "2025-02-03", "endDate": "2025-03-02", "goal": "多OpenAI兼容接口调度、自定义生图脚本、画布助手对话生图、跨平台Agent适配、SDK文档、插件沙箱安全、提示词库缓存"},
      {"id": "SPRINT-3", "title": "Sprint 3: 测试验收上线", "startDate": "2025-03-03", "endDate": "2025-03-28", "goal": "全场景集成测试、开源合规梳理、文档完善、Docker/Render部署、灰度发布、正式上线72小时值守"}
    ]
  }
}
~~~

## 1.8 飞书导入文件

~~~json
{
  "version": "v1.0-20250101",
  "format": "feishu-project-v1",
  "project": {
    "name": "Nova Canvas Phase 1",
    "description": "一站式多场景AI创意内容生产平台 - 基于infinite-canvas二次开发",
    "owner": "project-manager",
    "startDate": "2025-01-06",
    "endDate": "2025-03-28",
    "status": "planning",
    "methodology": "scrum",
    "sprintDuration": 14,
    "workflow": {
      "statuses": ["待办", "进行中", "评审中", "已完成", "阻塞"],
      "transitions": {
        "待办": ["进行中"],
        "进行中": ["评审中", "待办", "阻塞"],
        "评审中": ["已完成", "进行中"],
        "已完成": [],
        "阻塞": ["进行中"]
      }
    },
    "fields": [
      {"fieldKey": "epic", "fieldName": "所属Epic", "fieldType": "单选", "options": ["EPIC-CANVAS", "EPIC-AI", "EPIC-AGENT", "EPIC-PLUGIN", "EPIC-PROMPT", "EPIC-INFRA"]},
      {"fieldKey": "storyPoints", "fieldName": "故事点数", "fieldType": "数字"},
      {"fieldKey": "priority", "fieldName": "优先级", "fieldType": "单选", "options": ["P0-必须交付", "P1-重要但可延后"]},
      {"fieldKey": "sprint", "fieldName": "所属Sprint", "fieldType": "单选", "options": ["Sprint 1", "Sprint 2", "Sprint 3"]},
      {"fieldKey": "assigneeRole", "fieldName": "负责角色", "fieldType": "文本"},
