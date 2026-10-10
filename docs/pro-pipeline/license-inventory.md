# 正版软件授权采购清单与台账
# 目标：在写第一行代码前，把开发测试环境所需的正版授权与硬件就位。

## 采购清单（开发测试环境最小集，参考公开报价，实际以询价为准）

| 软件 | 版本档位 | 用途 | 参考年费（USD/席） | 备注 |
|---|---|---|---|---|
| Adobe After Effects | Creative Cloud 单应用 | AE 脚本开发与宿主测试 | ≈ 276 | 可含在全家桶内 |
| Foundry Nuke | NukeX | `.nk` 开发 + CopyCat 训练 | ≈ 5,219 | **CopyCat 需 NukeX 及以上** |
| Foundry Nuke | Nuke Render（无头渲染席） | 渲染节点 | ≈ 396 | **每渲染节点一席** |
| Autodesk Maya | Maya 订阅 | 场景生成与 AOV 渲染 | ≈ 1,875 | Arnold 已随附，无额外授权费 |

## 明确不采购的项
- 不采购 Nuke Indie（营收上限与分辨率上限限制，不适合商业交付）
- 不采购任何"共享授权"方案（违规）

## 授权台账记录模板
记录授权类型、席位数、到期日到 `license-inventory.md`，并在系统中配置 `LICENSE_REGISTRY`（供 `NC-PRO-00` 的 `license_ok` 校验读取）。

| 软件 | 授权类型 | 席位数 | 授权凭证编号 | 到期日 | 备注 |
|---|---|---|---|---|---|
| Adobe After Effects | CC 单应用 |  |  |  |  |
| Foundry Nuke | NukeX |  |  |  | CopyCat 需 NukeX+ |
| Foundry Nuke | Nuke Render |  |  |  | 渲染节点 |
| Autodesk Maya | Maya 订阅 |  |  |  | Arnold 随附 |

## 系统配置
系统配置项 `LICENSE_REGISTRY` 可被 `pipeline_gateway.assert_policy()` 读取，`license_ok=False` 时作业被拒。