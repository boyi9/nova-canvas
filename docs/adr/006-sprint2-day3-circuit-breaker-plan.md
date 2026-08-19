# ADR 006 — Sprint 2 Day 3：成本熔断模块开发计划（S1-W3-D2-02）

- **状态**：已批准（Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/plan`
- **关联任务**：S1-W3-D2-02（成本熔断 circuit_breaker.py，为 D1 前端接入奠基）
- **前置**：ADR 003（纯 stdlib 零依赖）、ADR 005（视频生成需熔断）
- **运行时**：Ollama `0.32.14`；熔断主要针对 OpenAI/Azure 高成本链路（音视频）

---

## 1. 开发边界

实现通用**熔断器 + 预算守卫**，核心是两条硬规则（来自 ADR 005 风险规避）：
1. **单请求超时熔断**：单次调用耗时 > `request_timeout_sec`（默认 5s）即记为失败并累积。
2. **月度预算熔断**：当月累计成本 > `monthly_budget_usd`（默认 500 USD）即拒绝后续高成本调用。

标准熔断器状态机：`CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN`。

## 2. 依赖约束（硬性）

- ✅ 纯标准库：`dataclasses` / `json` / `time` / `threading` / `concurrent.futures` / `os`
- ❌ 禁止 `tenacity` / `pybreaker` 等第三方熔断器
- ✅ 月度预算**可选持久化**到 JSON 文件（零依赖），未配置则在内存中记账

## 3. 接口规范

```python
@dataclass
class BreakerConfig:
    failure_threshold: int = 5          # 连续失败次数触发 OPEN
    recovery_timeout_sec: float = 30.0  # OPEN 持续多久后转 HALF_OPEN
    request_timeout_sec: float = 5.0    # 单请求硬超时（成本熔断核心）
    monthly_budget_usd: float = 500.0   # 月度预算上限
    budget_file: str = ""               # 预算持久化路径（空=内存）

class CircuitBreaker:
    def __init__(self, name: str, config: BreakerConfig | None = None): ...
    @property
    def state(self) -> str              # "CLOSED"|"OPEN"|"HALF_OPEN"
    def allow(self) -> bool             # 当前是否放行
    def call(self, func, *args, cost_usd: float = 0.0, **kwargs) -> Any
    # 异常：CircuitOpenError / BudgetExceededError / RequestTimeoutError
```

## 4. 与现有架构对齐

| 现有资产 | 复用/对接 |
|----------|-----------|
| `adapter.generate_video()` | 后续 D1 用 `CircuitBreaker.call(adapter.generate_video, ...)` 包裹 |
| `AdapterError`（adapter.py） | 熔断异常保持独立定义，避免循环依赖；D1 接入层统一转换 |
| `video.py` / `audio.py` | 可选在 service 层挂载 breaker（本任务仅提供模块 + 示例） |

## 5. 风险与规避

| 风险 | 规避 |
|------|------|
| Windows 无 `signal` 线程超时 | 用 `concurrent.futures.ThreadPoolExecutor` + `future.result(timeout=)` 实现超时 |
| 预算在多线程下竞态 | 用 `threading.Lock` 保护月度记账 |
| 进程重启丢预算 | `budget_file` 落盘 JSON（按 `{yyyy-mm}` 分账，跨月自动清零） |
| 误熔断正常慢请求 | 超时阈值可配置；HALF_OPEN 仅放 1 个探针，避免雪崩 |

## 6. 验收门禁（D2-02 关闭前）

- [ ] `circuit_breaker.py` 零第三方依赖，`py_compile` 通过
- [ ] 超时（>5s）、连续失败、预算超限三类熔断单测全绿
- [ ] HALF_OPEN 恢复路径单测覆盖
- [ ] `pytest` 通过，该模块覆盖率 ≥90%
- [ ] `/sync-board` 标记 `S1-W3-D2-02` = DONE
- [ ] ADR 006 归档
