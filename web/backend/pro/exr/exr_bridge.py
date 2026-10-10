# -*- coding: utf-8 -*-
# file: backend/pro/exr/exr_bridge.py
# 作用：把 EXR 从"Maya 能出"变成"Nuke 能用"，并把校验做成强制拦截。
# 依赖：仅 Python 标准库
import re
from typing import Dict, List


# 命名强制正则：<项目>_<镜头>_<版本>_<层>_<帧号4位>.exr
# 例：nova_sh010_v003_beauty_1001.exr
FILENAME_PAT = re.compile(
    r"^[a-z0-9]{2,16}_sh\d{3,4}_v\d{3}_[a-z0-9]+_\d{4}\.exr$"
)


# 通道契约：每个通道声明"标准名 / Nuke 消费方式 / 是否必需"
CHANNEL_CONTRACT = {
    "beauty":     {"required": True,  "nuke_use": "合成底",     "type": "rgb"},
    "Z":          {"required": True,  "nuke_use": "ZDefocus",    "type": "depth"},
    "crypto_asset": {"required": True,  "nuke_use": "Cryptomatte", "type": "mask"},
    "id":         {"required": True,  "nuke_use": "物体 ID 隔离", "type": "mask"},
    "AO":         {"required": False, "nuke_use": "环境光遮蔽",   "type": "rgb"},
    "lightgroup_key":   {"required": False, "nuke_use": "Relight 主光", "type": "rgb"},
    "lightgroup_fill":  {"required": False, "nuke_use": "Relight 补光", "type": "rgb"},
    "lightgroup_env":   {"required": False, "nuke_use": "Relight 环境光", "type": "rgb"},
    "motion":     {"required": False, "nuke_use": "运动模糊重建",  "type": "vector"},
}


def validate_channel_manifest(manifest: dict) -> List[str]:
    """
    校验交付通道清单：缺通道 / 缺色彩声明 / 缺命名均报错。
    返回问题列表，非空即阻断交付。
    """
    errors = []

    # 1) 必需通道齐全性
    required = [k for k, v in CHANNEL_CONTRACT.items() if v["required"]]
    missing = [c for c in required if c not in manifest.get("channels", [])]
    if missing:
        errors.append(f"缺失必需通道: {missing}")

    # 2) 文件名命名规范
    for f in manifest.get("files", []):
        if not FILENAME_PAT.match(f):
            errors.append(f"命名不合规: {f} (需符合 <项目>_sh###_v###_<层>_####.exr)")

    # 3) 色彩管理声明
    if not manifest.get("color_config"):
        errors.append("缺少色彩管理声明（OCIO/ACES 配置标识）")

    # 4) 通道契约完整性
    for ch in manifest.get("channels", []):
        if ch not in CHANNEL_CONTRACT:
            errors.append(f"未登记通道: {ch}")

    return errors


def validate_exr_headers(files: list) -> List[str]:
    """
    读取 EXR 文件头，校验实际通道与契约是否一致。
    依赖: pip install OpenEXR（可选，生产环境建议安装）。
    """
    errors = []
    try:
        import OpenEXR
    except ImportError:
        return ["OpenEXR 未安装，跳过头信息校验"]

    for f in files:
        try:
            exr = OpenEXR.InputFile(f)
            channels = list(exr.header()["channels"].keys())
            # 校验必需通道是否存在于文件中
            for req in ["beauty", "Z", "crypto_asset", "id"]:
                if req not in channels:
                    errors.append(f"{f}: 缺失必需通道 {req}")
        except Exception as e:
            errors.append(f"读取 {f} 失败: {e}")
    return errors


def build_delivery_manifest(shot: str, version: str,
                            channels: list, files: list,
                            color_config: str) -> dict:
    """构建标准交付清单，供 NC-PRO-08 校验与 NC-PRO-10 台账使用。"""
    return {
        "shot": shot,
        "version": version,
        "channels": channels,
        "files": files,
        "color_config": color_config,
        "channel_contract": {k: v for k, v in CHANNEL_CONTRACT.items()
                             if k in channels},
    }


if __name__ == "__main__":
    # Demo
    manifest = {
        "channels": list(["beauty", "Z", "crypto_asset", "id", "AO", "lightgroup_key"]),
        "files": ["nova_sh010_v003_beauty_1001.exr",
                  "nova_sh010_v003_Z_1001.exr"],
        "color_config": "aces_2.0_studio",
    }
    errs = validate_channel_manifest(manifest)
    print("Errors:", errs)

    # 缺失 beauty -> 应报错
    bad = {"channels": ["Z"], "files": [], "color_config": "aces"}
    print("Missing beauty:", validate_channel_manifest(bad))

    # 命名不合规
    bad2 = {"channels": ["beauty"], "files": ["sh010_beauty.exr"], "color_config": "aces"}
    print("Bad filename:", validate_channel_manifest(bad2))