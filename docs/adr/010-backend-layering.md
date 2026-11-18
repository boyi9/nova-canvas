# ADR 010：后端接口分层规范（handler → service → repository）

- 状态：已采纳（试点落地）
- 日期：2026-11-17
- 相关代码：`backend/internal/handlers/`、`backend/internal/service/`、`backend/internal/repository/`、`backend/internal/errs/`

## 背景

后端此前没有 service 层：handler 直接调用 repository，并承担了归属校验、积分扣减、默认值、错误文案等业务逻辑。由此带来：

- 同一规则（如「他人资源返回 404」）在多个 handler 中重复实现；
- 多仓储编排（生成任务 + 扣积分）散落在 HTTP 层，难以复用与测试；
- handler 同时依赖请求上下文与持久化细节，单测需要构造完整路由。

## 分层职责

```
HTTP 请求
   │
   ▼
handler   ← 只做传输层：绑定/校验 DTO、读取当前用户、调用 service、写响应
   │
   ▼
service   ← 业务层：对象级权限、业务规则、多仓储编排、领域错误
   │
   ▼
repository← 持久化层：只做 CRUD/查询，不含权限与业务判断
```

### handler 层

- 允许：`ShouldBindJSON`、读取 `c.GetString("user_id")`、解析 `uuid`/分页参数、`errs.RespondError`、组装响应 DTO。
- 禁止：直接调用多个仓库编排业务、在 handler 内做积分/库存等业务计算、拼接 SQL。
- 错误：service 返回 `*errs.AppError` 时直接 `errs.RespondError(c, err)`；未知错误在 service 内转换为 500，避免泄露内部细节。

### service 层

- 输入使用领域结构体（如 `ProjectInput`、`GenerationInput`），不依赖 `gin.Context`。
- 所有「按用户隔离」的资源查询必须经过 service 的统一校验：**他人资源一律 404**，不泄露存在性。
- 多仓储操作由 service 编排；需要原子性时在 service 内定义事务边界（当前 `gorm` 仓储未暴露事务接口，迁移时在 repository 增加 `WithTx`）。
- 分页参数在 service 内统一 clamp（上限 100），避免超大查询。
- 领域错误使用 `errs.ErrBadRequest/ErrNotFound/...`，transport 层不再重复判断业务条件。

### repository 层

- 只返回持久化结果与底层错误，不判断用户归属、不决定 HTTP 状态码。
- 查询接口应尽量显式带上 `user_id` 条件（如 `ListByUser`）；`FindByID` 的结果由 service 做归属校验。

## 错误与状态码映射

| 场景 | service 返回 | HTTP |
| --- | --- | --- |
| 参数/业务校验失败 | `errs.ErrBadRequest` | 400 |
| 未认证 | 中间件直接 401 | 401 |
| 积分不足 | `errs.ErrInsufficientCredits` | 402 |
| 资源不存在 / 非本人资源 | `errs.ErrNotFound` | 404 |
| 冲突（邮箱已注册等） | `errs.ErrConflict` | 409 |
| 持久化或依赖失败 | `errs.ErrInternal` | 500 |

## 本次试点

已迁移：

- **项目 CRUD**：`ProjectService`（列表分页 clamp、创建默认值、对象级权限、更新/删除）。
- **生成任务**：`GenerationService`（用户/积分校验、任务落库、积分扣减、状态查询归属校验）。

未迁移（后续按同一模式推进）：

- recipes / scripts 的文件存储仍位于 handlers 包（MVP 临时实现），后续下沉到独立 store/service；
- 视频/裂变/工作流等 handler 目前只做纯计算，不涉及多仓储编排，可保持现状；
- `auth` 领域已有独立 `auth.go` + `security`/`repository` 协作，暂不拆分，避免破坏已锁定的安全测试。

## 约束与检查清单

新增接口时必须：

1. handler 只依赖 service，不直接跨领域调用 repository；
2. service 方法接收 `context.Context` 与 `uuid.UUID` 用户 ID；
3. 对按 ID 访问的资源做归属校验，并补充越权测试；
4. 错误统一走 `errs.AppError`，不把底层错误原文返回给客户端；
5. 分页参数在 service 内 clamp。
