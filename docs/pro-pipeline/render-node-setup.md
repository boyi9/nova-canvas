# 渲染节点与云农场接入准备文档

## 目标
为本地/云双层算力做好环境，支持专业管线的渲染需求。

## 1. 本地渲染节点环境规划

### 节点分类
| 节点类型 | 操作系统 | 用途 | 关键软件 | 硬件建议 |
|---|---|---|---|---|
| AE 节点 | Windows Server 2022 | AE 无头渲染 (`aerender`) | After Effects 2026 (26.5+)、Nexrender | GPU: RTX 4090 / A6000, RAM 64GB+ |
| Nuke 节点 | Ubuntu 22.04 LTS | Nuke 无头渲染 (`Nuke -x`) | Nuke 16.x、NukeX (CopyCat) | GPU: RTX A6000, RAM 128GB+ |
| Maya 节点 | Ubuntu 22.04 LTS | Maya 批处理 (`mayabatch`) | Maya 2026、Arnold | GPU: RTX A6000, RAM 128GB+ |

### 关键决策
- **AE 无头渲染（`aerender`）仅 Windows**；Nuke 与 Maya 支持 Windows/Linux。
- 据此规划节点池：AE 节点池用 Windows，Nuke/Maya 节点池优先 Linux（成本低、易容器化）。

### 节点注册与心跳
每个节点启动时向调度器注册，包含信息：
```json
{
  "node_id": "ae_node_01",
  "os": "Windows",
  "dcc": "after_effects",
  "version": "26.5",
  "license_type": "CC_Enterprise",
  "vram_gb": 24,
  "ram_gb": 64,
  "cpu_cores": 16,
  "status": "idle",
  "last_heartbeat": "2026-10-09T10:00:00Z"
}
```

心跳间隔：30 秒。超时 90 秒未收到心跳 -> 标记为 offline，调度器自动摘除。

## 2. 云农场备选

### 选型标准
| 维度 | 要求 | 推荐服务商 |
|---|---|---|
| Maya+Arnold 支持 | 原生支持，无额外授权费 | 瑞云 Renderbus、青云渲染、阿里云渲染 |
| Nuke 云节点 | 按节点采购渲染席 | 瑞云、青云 |
| AE 云渲染 | 需 Windows 节点 + AE 授权 | 部分农场支持（需确认） |
| 计费模式 | 按核时计费 | 约 0.49 元/核时起 |

### 备选农场配置
```yaml
cloud_farms:
  primary:
    name: "瑞云 Renderbus"
    api_endpoint: "https://api.renderbus.com"
    supported_dcc: ["maya", "nuke", "arnold"]
    pricing: "0.49 CNY/核时"
    max_nodes: 100
  backup:
    name: "青云渲染"
    api_endpoint: "https://render.qingcloud.com"
    supported_dcc: ["maya", "blender", "arnold"]
    pricing: "0.55 CNY/核时"
```

## 3. 节点注册与队列接入

### 节点注册 API
```python
# 伪代码
def register_node(node_info: dict):
    # 验证授权、硬件信息
    # 写入节点注册表
    # 返回 node_id
    pass

def node_heartbeat(node_id: str):
    # 更新 last_heartbeat
    # 检查任务分配
    pass

def node_unregister(node_id: str):
    # 标记离线，重排任务
    pass
```

### 队列接入
- 使用 Celery + Redis 作为任务队列
- 每个节点运行专用 Worker：`celery -A tasks worker -Q ae_render,nuke_render,maya_render`
- 任务路由：根据 DCC 类型路由到对应队列

## 4. 渲染结果回传
- 渲染完成后，Worker 将结果上传到 MinIO/S3
- 回调调度器更新任务状态、记录实际成本
- 生成交付清单，触发 NC-PRO-08 校验与 NC-PRO-10 台账记录

## 4. 部署文件
- `deploy/render-node/Dockerfile`：Linux 渲染节点镜像（Nuke + Maya + Arnold）
- Windows 节点需手工配置（AE 必须 Windows）

## 5. 成本控制
- 单作业预估成本上限
- 单日总成本上限（默认 500 USD/天）
- 超限告警并要求人工确认（属于"花钱动作"，不得自动放行）