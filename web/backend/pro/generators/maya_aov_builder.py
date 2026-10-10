# -*- coding: utf-8 -*-
# file: backend/pro/generators/maya_aov_builder.py
# 作用：生成 Arnold AOV 多通道渲染配置（MEL），并校验通道契约完整性
# 依赖：仅 Python 标准库

# 通道契约：AOV -> (类型, Nuke 用途)
AOV_SET = {
    "beauty":            ("rgb",    "合成底"),
    "Z":                 ("depth",  "ZDefocus / 大气雾"),
    "crypto_asset":      ("mask",   "Cryptomatte 选区调色"),
    "id":                ("mask",   "物体 ID 隔离"),
    "AO":                ("rgb",    "环境光遮蔽叠加"),
    "lightgroup_key":    ("rgb",    "Relight 主光"),
    "lightgroup_fill":   ("rgb",    "Relight 补光"),
    "lightgroup_env":    ("rgb",    "Relight 环境光"),
    "motion":            ("vector", "运动模糊重建"),
}

# 分层渲染策略：fg 高采样 / mg 中 / bg 低
LAYER_SAMPLES = {"fg": 8, "mg": 5, "bg": 3}


def build_aov_mel(shot: str, version: str, renderer: str = "arnold") -> str:
    if renderer not in ("arnold", "vray", "redshift"):
        raise ValueError(f"未适配渲染器: {renderer}")
    mel = [f"// Nova Canvas AOV setup — {shot} {version} — renderer={renderer}"]
    for aov, (kind, _use) in AOV_SET.items():
        if renderer == "arnold":
            mel.append(f'// AOV {aov} ({kind})')
            mel.append(f'setAttr "defaultArnoldRenderOptions.aovList" -edit;')
    for layer, s in LAYER_SAMPLES.items():
        mel.append(f'// render layer {layer}: samples={s}')
    return "\n".join(mel)


def validate_channel_manifest(manifest: dict) -> list:
    """校验交付通道清单：缺通道 / 缺色彩声明 / 缺命名均报错。"""
    errors = []
    missing = set(AOV_SET.keys()) - set(manifest.get("channels", []))
    if missing:
        errors.append(f"缺失必需通道: {sorted(missing)}")
    if not manifest.get("color_config"):
        errors.append("缺少色彩管理声明（OCIO/ACES）")
    import re
    pat = re.compile(r"^[a-z0-9]{2,16}_sh\d{3,4}_v\d{3}_[a-z0-9]+_\d{4}\.exr$")
    for f in manifest.get("files", []):
        if not pat.match(f):
            errors.append(f"命名不合规: {f}")
    return errors


if __name__ == "__main__":
    mel = build_aov_mel("sh010", "v003")
    print("MEL lines:", len(mel.splitlines()))

    ok = {"channels": list(AOV_SET.keys()), "color_config": "ocio_2.2_materialx",
          "files": ["nova_sh010_v003_beauty_1001.exr"]}
    print("GOOD manifest errors:", validate_channel_manifest(ok))

    bad = {"channels": ["beauty", "Z"],
           "color_config": "",
           "files": ["nova_sh010_beauty.exr"]}
    for e in validate_channel_manifest(bad):
        print("BAD ->", e)

    try:
        build_aov_mel("sh011", "v001", renderer="unknown")
        print("ERROR: 未拦截未适配渲染器")
    except ValueError as e:
        print("RENDERER CHECKED:", e)