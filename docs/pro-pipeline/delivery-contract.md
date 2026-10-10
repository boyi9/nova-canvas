# 专业管线交付契约
# 版本 v14.0 · NC-PRO-08 交付契约定义

## 1. 交付物定义
专业管线交付物必须包含以下 5 类文件，**任一缺失即阻断交付**：

| 类别 | 内容 | 格式要求 | 校验方式 |
|---|---|---|---|
| **成片/序列** | 最终成片或图像序列 | MP4 (H.264/H.265) / EXR 序列 | 文件存在性 + 编码校验 |
| **通道契约** | EXR 通道清单与用途声明 | YAML/JSON | NC-PRO-08 `validate_channel_manifest` |
| **色彩声明** | OCIO/ACES 配置标识 | 字符串（如 `aces_2.0_studio`） | 非空校验 + 网关准入 |
| **版本号** | 交付版本号 | `v###` 格式 | NC-PRO-10 版本号校验 |
| **镜头号** | 对应镜头标识 | `sh###` 格式 | 台账关联校验 |

## 2. 交付清单结构
```json
{
  "delivery_id": "del_sh010_v003",
  "shot_id": "sh010",
  "version": "v003",
  "pipeline": "ae_nuke",
  "files": [
    "nova_sh010_v003_beauty_1001.exr",
    "nova_sh010_v003_Z_1001.exr",
    "nova_sh010_v003_crypto_asset_1001.exr",
    "nova_sh010_v003_id_1001.exr"
  ],
  "channel_manifest": {
    "channels": ["beauty", "Z", "crypto_asset", "id"],
    "color_config": "aces_2.0_studio"
  },
  "color_config": "aces_2.0_studio",
  "version": "v003",
  "shot_id": "sh010",
  "pipeline": "ae_nuke",
  "delivered_at": "2026-10-09T10:00:00Z",
  "render_tier": "local",
  "checksums": {
    "nova_sh010_v003_beauty_1001.exr": "sha256:...",
    "nova_sh010_v003_Z_1001.exr": "sha256:..."
  }
}
```

## 3. 校验规则（NC-PRO-08 强制执行）
1. **命名强制正则**：`<项目>_<镜头>_<版本>_<层>_<帧号4位>.exr`
   - 例：`nova_sh010_v003_beauty_1001.exr`
2. **必需通道齐全**：beauty、Z、crypto_asset、id
3. **色彩管理声明**：必须包含 OCIO/ACES 配置标识（如 `aces_2.0_studio`）
4. **版本一致性**：交付版本必须与 NC-PRO-10 台账最新版本一致
5. **校验和**：每个文件需附带 SHA256 校验和

## 3. 交付流程
```
1. 渲染完成 -> 2. NC-PRO-08 validate_channel_manifest
                        -> 3. 通过 -> NC-PRO-10 register_delivery
                                        -> 6. 生成接缝任务 FINAL_APPROVE
                                                   -> 7. 人工终审确认
                                                               -> 8. 进入发布流程
                          -> 失败 -> 返回错误详情 -> 退回重做
```

## 5. 降级交付
若专业管线交付失败（如色彩声明缺失、通道缺失），允许降级为：
- 仅交付成片 MP4（标注 `render_tier: downgraded`）
- 必须在元数据中标注降级原因
- 仍需生成接缝任务，人工确认后方可发布