# Nova Canvas（启画）Sprint 1 Week 1 交付物汇总

> **导出格式**：Markdown（单文件）
> **生成日期**：2025-01-16
> **项目根目录**：`D:\nova启画\novainfinite\`
> **范围**：Sprint 1 → Week 1 全部生成物（任务拆解记录 / 代码片段 / 调试日志）
> **对应看板**：`board-import/*`

---

## 目录
- [第一部分：任务拆解记录](#第一部分任务拆解记录)
  - [1.1 Epics](#11-epics)
  - [1.2 Stories](#12-stories)
  - [1.3 Tasks（Day 1-5 拆解）](#13-tasksday-1-5-拆解)
  - [1.4 Labels](#14-labels)
  - [1.5 Sprints](#15-sprints)
  - [1.6 Jira 导入文件](#16-jira-导入文件)
  - [1.7 GitHub Projects 导入文件](#17-github-projects-导入文件)
  - [1.8 飞书导入文件](#18-飞书导入文件)
- [第二部分：生成的代码片段](#第二部分生成的代码片段)
  - [2.1 INFRA-001（CI 流水线）](#21-infra-001ci-流水线)
  - [2.2 INFRA-002（回归测试提取）](#22-infra-002回归测试提取)
  - [2.3 CANVAS-001（画布兼容性分析）](#23-canvas-001画布兼容性分析)
  - [2.4 MCP Demo（Agent 闭环）](#24-mcp-demoagent-闭环)
- [第三部分：调试日志](#第三部分调试日志)
  - [3.1 P0 后端验证调试日志](#31-p0-后端验证调试日志)

---

# 第一部分：任务拆解记录

> 来源：`C:\board-import\v1.0-20250101-*.csv|json`
> 用途：Jira / GitHub Projects / 飞书 三套看板导入，Epic→Story→Task 全量拆解

## 1.1 Epics

~~~csv
Epic Key,Epic Name,Description,Status,Priority,Start Date,End Date
EPIC-CANVAS,核心画布能力,兼容infinite-canvas原生多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出全部原有能力,To Do,P0,2025-01-06,2025-02-28
EPIC-AI,AI创作能力,保留原生浏览器前台直连OpenAI兼容接口能力，文生图、图生图、参考图编辑、文本问答、音频和视频生成五类核心能力,To Do,P0,2025-01-13,2025-02-14
EPIC-AGENT,画布助手与Agent能力,围绕选中节点和上游节点对话、生图功能可用，生成结果可直接一键插回当前画布,To Do,P0,2025-01-20,2025-03-07
EPIC-PLUGIN,插件系统,远程节点插件的URL动态安装/启用/更新/卸载全流程可用，配套TypeScript SDK开发文档完整,To Do,P0,2025-01-27,2025-03-14
EPIC-PROMPT,提示词库,前端直连多个GitHub开源提示词项目，所有提示词资源可自动缓存到IndexedDB,To Do,P1,2025-02-10,2025-03-21
EPIC-INFRA,基础部署与合规,保留原有Docker部署方案，用户配置本地加密存储，开源协议合规梳理,To Do,P0,2025-01-06,2025-03-28
~~~

## 1.2 Stories

~~~csv
Story Key,Epic Key,Story Name,Description,Acceptance Criteria,Priority,Story Points,Sprint,Assignee Role,Labels,Dependencies
CANVAS-001,EPIC-CANVAS,原有画布核心能力兼容性改造,"兼容infinite-canvas原生多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出全部原有能力，原有功能通过率100%，历史创建的画布项目可无缝迁移导入",原有功能通过率100%|历史画布无缝迁移导入|画布节点操作手册/快捷键体系同步更新,P0,8,Sprint 1,前端开发,"canvas,compat",INFRA-001;INFRA-002
CANVAS-002,EPIC-CANVAS,画布操作手册与快捷键文档更新,更新画布节点操作手册、快捷键体系同步完成适配更新，与新版功能完全匹配,手册覆盖所有新功能|快捷键无冲突|中英文对照,P1,3,Sprint 3,产品经理,"docs,canvas",CANVAS-001
AI-001,EPIC-AI,多OpenAI兼容接口调度能力开发,"保留原生浏览器前台直连OpenAI兼容接口能力，文生图、图生图、参考图编辑、文本问答、音频和视频生成五类核心能力调用成功率≥98%",五类能力调用成功率≥98%|自动熔断降级|请求耗时P99<30s,P0,8,Sprint 2,全栈/后端开发,"ai,api",INFRA-003
AI-002,EPIC-AI,自定义生图脚本调用能力开发,自定义生图/视频接口调用脚本配置功能上线，支持灵活适配各类中转站与自建服务，用户可自行上传配置脚本完成私有服务对接,脚本配置UI可用|中转站/自建服务对接成功|脚本沙箱隔离,P0,8,Sprint 2,后端开发,"ai,script,security",AI-001;PLUGIN-003
AGENT-001,EPIC-AGENT,MCP协议对接层基础封装,本地Canvas Agent通过MCP协议对接Codex / Claude Code的调通率100%，可实现Agent直接操作当前画布的全流程闭环,MCP协议对接率100%|Agent操作画布闭环|Codex/Claude Code双适配,P0,8,Sprint 1,后端开发,"agent,mcp",INFRA-003
AGENT-002,EPIC-AGENT,画布助手对话生图插回画布能力开发,围绕选中节点和上游节点对话、生图功能可用，生成结果可直接一键插回当前画布，操作路径不超过2步,选中节点上下文注入|生图结果一键插回|操作路径≤2步,P0,8,Sprint 2,前端+后端开发,"agent,canvas",AGENT-001;AI-001
AGENT-003,EPIC-AGENT,跨平台本地Agent兼容性适配,Codex App插件完成适配，安装后可自动注册MCP并拉起本地Agent，引导流程完整通顺，Windows/macOS/Linux三平台验证,三平台各50次全流程验证通过|端口冲突自动解决|权限路径自动适配,P0,8,Sprint 2,后端开发,"agent,cross-platform",AGENT-001
PLUGIN-001,EPIC-PLUGIN,远程插件安装基础框架搭建,远程节点插件的URL动态安装/启用/更新/卸载全流程可用,安装/启用/更新/卸载全流程可用|插件热加载无刷新,P0,5,Sprint 1,前端开发,"plugin,framework",INFRA-003
PLUGIN-002,EPIC-PLUGIN,TypeScript SDK开发文档输出,配套的TypeScript SDK开发文档完整，开发者可基于SDK在30分钟内完成简单自定义插件开发,SDK文档完整|30分钟快速上手|示例插件可运行,P1,5,Sprint 2,前端开发,"plugin,sdk,docs",PLUGIN-001
PLUGIN-003,EPIC-PLUGIN,插件沙箱安全能力开发,所有插件运行在隔离iframe环境，默认禁止插件直接访问浏览器本地存储，新增插件权限申请校验机制,沙箱隔离生效|本地存储访问拦截|权限申请校验通过,P0,8,Sprint 2,后端开发,"plugin,security",PLUGIN-001
PROMPT-001,EPIC-PROMPT,提示词库联网缓存能力开发,前端直连多个GitHub开源提示词项目，所有提示词资源可自动缓存到IndexedDB，本地离线访问可用率100%，检索响应耗时≤200ms,多源同步缓存|离线可用率100%|检索≤200ms|自动淘汰策略,P1,5,Sprint 2,前端开发,"prompt,cache",INFRA-003
INFRA-001,EPIC-INFRA,开源仓库主干分支同步CI流水线搭建,建立每日自动同步上游主库的CI流水线，每日凌晨自动合并上游最新提交到开发分支，跑通全量回归测试,每日自动同步|全量回归测试通过|冲突自动报警,P0,3,Sprint 1,全栈/后端开发,"infra,ci",-
INFRA-002,EPIC-INFRA,原有infinite-canvas全量用例回归验证,先完整拉取原生仓库全量单元测试用例，改造前后跑通全量回归测试,全量单测用例拉取|回归测试100%通过,P0,5,Sprint 1,测试/开发,"infra,test",INFRA-001
INFRA-003,EPIC-INFRA,开发环境、自动化测试环境部署完成,保留原有Docker部署方案，默认3000端口启动服务可用，配套Render部署指引更新完成,Docker一键启动|3000端口可用|Render指引更新,P0,5,Sprint 1,运维/开发,"infra,deploy",-
INFRA-004,EPIC-INFRA,全场景集成测试用例执行，bug闭环,开发阶段提前在三类操作系统各做至少50次全流程验证，提前适配不同系统的端口占用、权限路径差异,集成测试100%通过|Bug零遗留|三平台各50次验证,P0,8,Sprint 3,测试工程师,"infra,test",ALL
INFRA-005,EPIC-INFRA,开源协议合规全量梳理检查,安排专人梳理所有开源依赖的许可协议，所有分发页面保留原作者信息和开源标识，同步把修改后的代码回流上游开源社区,依赖许可协议台账|原作者信息保留|代码回流上游,P0,5,Sprint 3,产品+法务,"infra,compliance",-
INFRA-006,EPIC-INFRA,全量灰度测试，线上环境压力验证,全量灰度测试，线上环境压力验证,灰度流量10%→50%→100%|核心指标达标|回滚预案就绪,P0,5,Sprint 3,全团队,"infra,release",INFRA-004;INFRA-005
INFRA-007,EPIC-INFRA,正式版本发布上线，上线后72小时值守,正式版本发布上线，上线后72小时值守,发布上线|72小时值守零P0|监控大盘正常,P0,3,Sprint 3,全团队,"infra,release",INFRA-006
DEPLOY-001,EPIC-INFRA,Docker、Render部署脚本与指引更新,所有用户配置的AI API Key、Base URL、画布素材、生成记录默认本地加密存储，无明文上传云端行为，符合数据安全规范,Docker/Render部署可用|本地加密存储|无明文上传,P0,3,Sprint 3,运维/开发,"deploy,security",INFRA-003
~~~

## 1.3 Tasks（Day 1-5 拆解，完整 60 行见原始 tasks.csv）

~~~csv
Task Key,Story Key,Task Name,Description,Story Points,Assignee Role,Sprint,Week,Day,Labels,Dependencies,Acceptance Criteria
S1-W1-D1-01,INFRA-001,CI流水线搭建-GitHub Actions配置,配置GitHub Actions每日定时触发同步上游主库,1,全栈/后端开发,Sprint 1,1,1,"ci,github-actions",-,Workflow文件生效|定时触发正常
S1-W1-D1-02,INFRA-001,CI流水线搭建-合并冲突自动处理,实现上游提交自动合并到开发分支，冲突时自动创建PR并@相关人员,1,全栈/后端开发,Sprint 1,1,1,"ci,merge",S1-W1-D1-01,冲突自动创建PR|无冲突自动合并
S1-W1-D1-03,INFRA-001,CI流水线搭建-全量回归测试集成,集成现有单测/集成测试到流水线，失败阻断合并,1,全栈/后端开发,Sprint 1,1,1,"ci,test",S1-W1-D1-02,测试失败阻断|通过自动合并
S1-W1-D2-01,INFRA-002,拉取原生仓库全量单测用例,Clone infinite-canvas仓库，提取所有单元测试用例至本地测试目录,2,测试/开发,Sprint 1,1,2,"test,regression",S1-W1-D1-03,用例提取完整|目录结构清晰
S1-W1-D2-02,INFRA-002,建立回归测试基线,运行提取的用例建立通过基线，记录失败用例并分类,2,测试/开发,Sprint 1,1,2,"test,baseline",S1-W1-D2-01,基线建立|失败用例分类记录
S1-W1-D3-01,INFRA-002,回归测试自动化脚本编写,编写自动化运行脚本，支持一键执行全量回归测试,1,测试/开发,Sprint 1,1,3,"test,automation",S1-W1-D2-02,一键运行|生成测试报告
S1-W1-D4-01,CANVAS-001,画布核心引擎兼容性分析,分析infinite-canvas核心渲染引擎、状态管理、插件系统架构,2,前端开发,Sprint 1,1,4,"canvas,analysis",INFRA-002,架构分析文档输出|风险点识别
S1-W1-D4-02,CANVAS-001,画布核心能力兼容改造-渲染引擎,适配原有渲染引擎至新架构，保证节点拖拽缩放、连线、小地图功能正常,3,前端开发,Sprint 1,1,4,"canvas,render",S1-W1-D4-01,渲染无异常|性能无回退
S1-W1-D5-01,CANVAS-001,画布核心能力兼容改造-状态管理,适配撤销重做、导入导出、多画布项目管理功能,2,前端开发,Sprint 1,1,5,"canvas,state",S1-W1-D4-02,撤销重做正常|导入导出无损
S1-W1-D5-02,CANVAS-001,历史画布迁移验证,验证历史创建的画布项目可无缝迁移导入,1,前端开发,Sprint 1,1,5,"canvas,migration",S1-W1-D5-01,历史画布100%可导入|数据无丢失
S1-W2-D1-01,AGENT-001,MCP协议基础类型定义,定义MCP协议核心类型：Tool、Resource、Prompt、ServerCapabilities等,2,后端开发,Sprint 1,2,1,"agent,mcp,types",INFRA-003,类型定义完整|TS编译通过
S1-W2-D1-02,AGENT-001,MCP Server基础实现,实现MCP Server基础框架：初始化、能力协商、请求路由,2,后端开发,Sprint 1,2,1,"agent,mcp,server",S1-W2-D1-01,Server启动正常|能力协商通过
S1-W2-D2-01,AGENT-001,Canvas操作Tool集实现,实现画布核心操作Tool：节点增删改查、连线、画布导航、导出等,2,后端开发,Sprint 1,2,2,"agent,mcp,tools",S1-W2-D1-02,Tool调用成功|画布状态同步
S1-W2-D2-02,AGENT-001,Codex App插件注册逻辑复用,复用官方Codex App插件的MCP注册逻辑，实现自动注册并拉起本地Agent,2,后端开发,Sprint 1,2,2,"agent,codex,mcp",S1-W2-D2-01,插件安装后自动注册|Agent可被拉起
S1-W2-D3-01,AGENT-001,Claude Code适配层实现,实现Claude Code的MCP适配层，支持双Agent并存切换,2,后端开发,Sprint 1,2,3,"agent,claude,mcp",S1-W2-D2-02,Claude Code可接入|切换无异常
S1-W2-D3-02,AGENT-001,MCP对接层单测与集成测试,编写MCP层单元测试、集成测试，验证全流程闭环,1,后端开发,Sprint 1,2,3,"agent,mcp,test",S1-W2-D3-01,测试覆盖≥80%|全流程闭环验证
S1-W2-D4-01,PLUGIN-001,远程插件安装核心框架,实现插件URL解析、manifest获取、代码下载、沙箱加载流程,2,前端开发,Sprint 1,2,4,"plugin,framework",INFRA-003,插件安装流程跑通|Manifest校验通过
S1-W2-D4-02,PLUGIN-001,插件启用/禁用/更新/卸载状态机,实现插件生命周期状态机：安装→启用→更新→禁用→卸载,2,前端开发,Sprint 1,2,4,"plugin,lifecycle",S1-W2-D4-01,状态流转正确|UI实时同步
S1-W2-D5-01,PLUGIN-001,插件热加载无刷新机制,实现插件代码热更新，无需刷新页面即可生效,1,前端开发,Sprint 1,2,5,"plugin,hot-reload",S1-W2-D4-02,热加载生效|页面无刷新
S1-W2-D5-02,INFRA-003,Docker开发环境一键启动,完善docker-compose.yml，包含前端、后端、数据库、缓存服务,2,运维/开发,Sprint 1,2,5,"infra,docker",-,一键启动|3000端口可访问
S1-W2-D5-03,INFRA-003,Render部署指引文档更新,更新Render部署文档，包含环境变量、构建命令、启动命令配置,1,运维/开发,Sprint 1,2,5,"infra,deploy,docs",S1-W2-D5-02,文档可直接按步骤部署成功
S1-W3-D1-01,AI-001,OpenAI兼容接口适配器设计,设计统一适配器接口，支持OpenAI、Azure、自建中转站等多种后端,2,全栈/后端开发,Sprint 2,3,1,"ai,adapter,design",INFRA-003,接口设计文档|支持多后端
S1-W3-D1-02,AI-001,文生图/图生图能力接入,接入文生图、图生图两大核心能力，实现请求转发、流式响应、错误重试,3,全栈/后端开发,Sprint 2,3,1,"ai,t2i,i2i",S1-W3-D1-01,两类能力调用成功|流式响应正常
S1-W3-D2-01,AI-001,参考图编辑/文本问答/音视频生成能力接入,接入参考图编辑、文本问答、音频生成、视频生成四项能力,3,全栈/后端开发,Sprint 2,3,2,"ai,edit,chat,audio,video",S1-W3-D1-02,四项能力调用成功|成功率≥98%
S1-W3-D2-02,AI-001,接口熔断降级与监控埋点,实现熔断器模式、自动降级到备用模型、Prometheus监控指标埋点,2,全栈/后端开发,Sprint 2,3,2,"ai,circuit-breaker,monitor",S1-W3-D2-01,熔断生效|监控指标采集正常
S1-W3-D3-01,AI-002,自定义脚本配置UI开发,开发脚本上传、编辑、版本管理、参数配置的前端界面,2,后端开发,Sprint 2,3,3,"ai,script,ui",AI-001,UI交互完整|参数校验生效
S1-W3-D3-02,AI-002,脚本沙箱执行环境实现,基于VM2/isolated-vm实现脚本隔离执行环境，限制权限、资源、网络访问,3,后端开发,Sprint 2,3,3,"ai,script,sandbox",S1-W3-D3-01,沙箱隔离生效|恶意代码拦截
S1-W3-D4-01,AI-002,脚本调度与结果回写,实现脚本任务调度、进度回调、结果解析、错误处理、积分扣减,2,后端开发,Sprint 2,3,4,"ai,script,scheduler",S1-W3-D3-02,调度正常|结果准确回写
S1-W3-D4-02,AI-002,脚本市场基础框架,实现官方审核脚本上架、分类展示、一键安装功能,1,后端开发,Sprint 2,3,4,"ai,script,marketplace",S1-W3-D4-01,上架/安装流程跑通
S1-W3-D5-01,AGENT-002,选中节点上下文提取,实现获取选中节点及上游节点的完整上下文信息（类型、内容、位置、样式等）,2,前端+后端开发,Sprint 2,3,5,"agent,context",AGENT-001;AI-001,上下文提取完整|数据结构规范
S1-W3-D5-02,AGENT-002,对话生图Prompt构建,基于节点上下文构建生图Prompt，支持风格迁移、内容扩展、局部重绘等模式,2,前端+后端开发,Sprint 2,3,5,"agent,prompt",S1-W3-D5-01,Prompt构建正确|多模式支持
S1-W4-D1-01,AGENT-002,生成结果一键插回画布,实现生成图片/视频自动创建节点、定位放置、连线关联上游节点,2,前端+后端开发,Sprint 2,4,1,"agent,canvas,insert",S1-W3-D5-02,插回一步完成|位置连线正确
S1-W4-D1-02,AGENT-002,操作路径优化至2步以内,优化交互流程：选中节点→对话指令→自动生成插回，中间无额外确认步骤,1,前端+后端开发,Sprint 2,4,1,"agent,ux",S1-W4-D1-01,全流程≤2步操作|无阻断确认
S1-W4-D2-01,AGENT-003,Windows平台兼容性适配,适配Windows端口占用检测、进程管理、路径分隔符、权限提升等差异,3,后端开发,Sprint 2,4,2,"agent,windows",AGENT-001,Windows全流程50次通过
S1-W4-D2-02,AGENT-003,macOS平台兼容性适配,适配macOS沙箱权限、码签验证、LaunchAgent自启动、Homebrew路径等差异,3,后端开发,Sprint 2,4,2,"agent,macos",AGENT-001,macOS全流程50次通过
S1-W4-D3-01,AGENT-003,Linux平台兼容性适配,适配Linux系统d systemd服务、权限模型、显示服务、容器化环境差异,2,后端开发,Sprint 2,4,3,"agent,linux",AGENT-001,Linux全流程50次通过
S1-W4-D3-02,PLUGIN-002,TypeScript SDK核心API设计,设计插件开发核心API：节点操作、画布事件、存储访问、网络请求、UI组件,2,前端开发,Sprint 2,4,3,"plugin,sdk,api",PLUGIN-001,API设计文档|类型定义完整
S1-W4-D4-01,PLUGIN-002,SDK示例插件开发,开发3个不同复杂度的示例插件：Hello World、节点批处理、外部API集成,2,前端开发,Sprint 2,4,4,"plugin,sdk,example",S1-W4-D3-02,示例可运行|30分钟上手验证
S1-W4-D4-02,PLUGIN-002,SDK开发文档输出,输出完整开发文档：快速开始、API参考、最佳实践、调试指南、发布流程,1,前端开发,Sprint 2,4,4,"plugin,sdk,docs",S1-W4-D4-01,文档完整|新手可独立开发
S1-W4-D5-01,PLUGIN-003,iframe沙箱隔离环境实现,基于iframe+postMessage实现插件沙箱，配置CSP策略限制权限,3,后端开发,Sprint 2,4,5,"plugin,security,sandbox",PLUGIN-001,沙箱隔离生效|权限受限
S1-W4-D5-02,PLUGIN-003,本地存储访问拦截与权限申请,实现IndexedDB/localStorage访问拦截，插件需声明权限经用户授权后方可访问,2,后端开发,Sprint 2,4,5,"plugin,security,permission",S1-W4-D5-01,拦截生效|权限流程完整
S1-W4-D5-03,PROMPT-001,GitHub提示词源同步器开发,开发定时同步多个GitHub开源提示词仓库，增量更新、去重、格式标准化,2,前端开发,Sprint 2,4,5,"prompt,sync",INFRA-003,同步准确|增量更新正常
S1-W5-D1-01,PROMPT-001,IndexedDB缓存层实现,实现提示词本地缓存：分片存储、LRU淘汰、版本控制、离线优先策略,2,前端开发,Sprint 2,5,1,"prompt,cache,indexeddb",S1-W4-D5-03,缓存读写正常|LRU淘汰生效
S1-W5-D1-02,PROMPT-001,检索接口与性能优化,实现全文检索、标签筛选、语义搜索接口，响应耗时≤200ms,1,前端开发,Sprint 2,5,1,"prompt,search,perf",S1-W5-D1-01,检索≤200ms|离线可用率100%
S1-W5-D2-01,INFRA-004,集成测试用例设计与编写,基于所有Story验收标准设计集成测试用例，覆盖核心业务流程,3,测试工程师,Sprint 3,5,2,"test,integration",ALL,用例覆盖率≥95%|可自动化执行
S1-W5-D2-02,INFRA-004,自动化测试流水线搭建,搭建CI/CD集成测试流水线：环境准备、测试执行、报告生成、失败通知,2,测试工程师,Sprint 3,5,2,"test,ci",S1-W5-D2-01,流水线跑通|报告自动生成
S1-W5-D3-01,INFRA-004,三平台跨平台验证执行,在Windows/macOS/Linux各执行50次Agent全流程验证，记录失败案例,3,测试工程师,Sprint 3,5,3,"test,cross-platform",AGENT-003,三平台各50次|通过率100%
S1-W5-D3-02,INFRA-004,大存储压力测试,模拟10GB画布素材本地存储场景，验证IndexedDB不溢出、自动清理生效,2,测试工程师,Sprint 3,5,3,"test,stress",PROMPT-001;CANVAS-001,10GB场景稳定|自动清理触发
S1-W5-D4-01,INFRA-005,开源依赖许可协议扫描,使用工具扫描所有依赖许可协议，建立台账，识别风险依赖,2,产品+法务,Sprint 3,5,4,"compliance,license",-,台账建立完整|风险依赖标记
S1-W5-D4-02,INFRA-005,代码回流上游PR提交,将修改的开源代码整理提交PR至infinite-canvas上游仓库,1,产品+法务,Sprint 3,5,4,"compliance,upstream",S1-W5-D4-01,PR提交成功|社区响应跟进
S1-W5-D5-01,CANVAS-002,画布操作手册编写,编写完整操作手册：基础操作、进阶技巧、快捷键大全、常见问题,2,产品经理,Sprint 3,5,5,"docs,canvas",CANVAS-001,手册覆盖所有功能|截图清晰
S1-W5-D5-02,CANVAS-002,快捷键体系文档对照表,输出新旧快捷键对照表、冲突说明、自定义配置指引,1,产品经理,Sprint 3,5,5,"docs,shortcuts",S1-W5-D5-01,对照表准确|无冲突遗漏
S1-W6-D1-01,DEPLOY-001,Docker生产环境优化,优化Dockerfile多阶段构建、镜像体积压缩、安全扫描通过,2,运维/开发,Sprint 3,6,1,"deploy,docker,prod",INFRA-003,镜像<500MB|安全扫描通过
S1-W6-D1-02,DEPLOY-001,Render部署自动化脚本,编写Render一键部署脚本：环境变量注入、数据库迁移、健康检查,1,运维/开发,Sprint 3,6,1,"deploy,render,auto",S1-W6-D1-01,脚本执行部署成功
S1-W6-D2-01,INFRA-006,灰度发布策略配置,配置Nginx/Cloudflare灰度规则：10%→50%→100%流量逐步切换,2,全团队,Sprint 3,6,2,"release,canary",INFRA-004;INFRA-005,灰度规则生效|监控指标正常
S1-W6-D2-02,INFRA-006,线上压力验证执行,使用k6/Locust进行线上压力测试：核心接口QPS、延迟、错误率、资源占用,2,全团队,Sprint 3,6,2,"release,stress",S1-W6-D2-01,核心指标达标|无内存泄漏
S1-W6-D3-01,INFRA-006,回滚预案演练,执行完整回滚演练：镜像回滚、数据库迁移回滚、配置回滚，验证RTO<10min,1,全团队,Sprint 3,6,3,"release,rollback",S1-W6-D2-02,回滚<10min|数据零丢失
S1-W6-D4-01,INFRA-007,正式版本发布流程执行,执行发布检查清单：版本打Tag、镜像推送、配置变更、DNS切换、监控确认,2,全团队,Sprint 3,6,4,"release,prod",S1-W6-D3-01,发布清单全勾选|版本上线
S1-W6-D4-02,INFRA-007,上线后72小时值守轮班,制定72小时值守轮班表、告警响应SOP、问题升级路径、复盘模板,1,全团队,Sprint 3,6,4,"release,oncall",S1-W6-D4-01,值守表就绪|SOP可执行
~~~

## 1.4 Labels

~~~csv
Label Key,Label Name,Label Color,Description,Applicable Types
p0,P0-必须交付,#FF0000,本阶段核心必须交付功能，延期即项目失败,Epic;Story;Task
p1,P1-重要但可延后,#FFA500,重要但可在Phase 2补齐的功能,Story;Task
canvas,画布相关,#00B8D9,涉及画布渲染、交互、状态管理的任务,Story;Task
ai,AI能力相关,#6554C0,涉及模型接入、生成能力、脚本调度的任务,Story;Task
agent,Agent智能体相关,#00875A,涉及MCP协议、本地Agent、画布助手的任务,Story;Task
plugin,插件系统相关,#FF5630,涉及插件框架、SDK、沙箱安全的任务,Story;Task
prompt,提示词库相关,#FF8B00,涉及提示词同步、缓存、检索的任务,Story;Task
infra,基础设施相关,#0065FF,涉及CI/CD、部署、测试、合规的任务,Story;Task
