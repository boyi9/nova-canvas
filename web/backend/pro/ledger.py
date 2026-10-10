# -*- coding: utf-8 -*-
# file: backend/pro/ledger.py
# 作用：镜头/版本/资产台账，解决"用错旧素材"与"找不到交付物"两个高频事故。
# 依赖：仅 Python 标准库
import os
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Dict, List, Optional


@dataclass
class ProShot:
    """镜头档案"""
    shot_id: str
    project_id: str
    scene: str
    description: str
    status: str = "waiting"  # waiting / in_progress / reviewing / approved / retake


@dataclass
class ProVersion:
    """版本档案：每个镜头的每一次处理产出"""
    shot_id: str
    version: str
    process_type: str       # AE / NUKE / MAYA
    engine_file: str        # 生成的脚本/工程文件路径
    render_path: str        # 渲染输出路径
    color_config: str       # OCIO/ACES 配置
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ProAsset:
    """资产档案"""
    asset_id: str
    type: str               # model / texture / hdri / font / audio
    source: str             # generated / purchased / user_uploaded
    license: str            # 版权/授权信息
    path: str               # 存储路径


@dataclass
class ProDelivery:
    """交付记录"""
    delivery_id: str
    shot_id: str
    version: str
    files: List[str] = field(default_factory=list)
    channel_manifest: Dict = field(default_factory=dict)
    delivered_at: str = field(default_factory=lambda: datetime.now().isoformat())


# 版本号解析与排序（关键：必须按数值排序，防止 v10 排在 v2 前）
VER_PAT = re.compile(r"^v(\d+)$")


def version_sort_key(v: str) -> int:
    m = VER_PAT.match(v)
    if not m:
        raise ValueError(f"非法版本号: {v}")
    return int(m.group(1))


def get_latest_version(render_dir: str) -> str:
    """扫描渲染目录，自动识别最高版本（行业内高频事故点）。"""
    if not os.path.isdir(render_dir):
        raise FileNotFoundError(render_dir)
    versions = [d for d in os.listdir(render_dir)
                if VER_PAT.match(d) and os.path.isdir(os.path.join(render_dir, d))]
    if not versions:
        raise ValueError(f"目录下没有符合 v### 规范的版本: {render_dir}")
    return max(versions, key=lambda x: int(VER_PAT.match(x).group(1)))


def verify_delivery_version(shot_id: str, version: str, render_root: str) -> bool:
    """交付前强制校验：交付物版本 == 台账最新版本。"""
    latest = get_latest_version(os.path.join(render_root, f"sh{shot_id}"))
    return version == latest


# 台账持久化（SQLite，重启不丢）
# namespace: pro.shot / pro.version / pro.asset / pro.delivery
from web.backend.services.db import Database  # noqa: E402

NS_SHOT = "pro.shot"
NS_VERSION = "pro.version"
NS_ASSET = "pro.asset"
NS_DELIVERY = "pro.delivery"


def _db() -> Database:
    return Database.instance()


def register_shot(shot: ProShot) -> None:
    _db().put(NS_SHOT, shot.shot_id, asdict(shot))


def register_version(ver: ProVersion) -> None:
    # key 含版本号，重复注册同一版本为幂等覆盖
    _db().put(NS_VERSION, f"{ver.shot_id}::{ver.version}", asdict(ver))


def register_asset(asset: ProAsset) -> None:
    _db().put(NS_ASSET, asset.asset_id, asdict(asset))


def register_delivery(delivery: ProDelivery) -> None:
    _db().put(NS_DELIVERY, delivery.delivery_id, asdict(delivery))


def _load_versions(shot_id: str) -> List[ProVersion]:
    prefix = f"{shot_id}::"
    out: List[ProVersion] = []
    for item in _db().list(NS_VERSION):
        doc_id = item.pop("_id", "")
        if doc_id.startswith(prefix):
            out.append(ProVersion(**{k: v for k, v in item.items() if k in ProVersion.__dataclass_fields__}))
    out.sort(key=lambda v: int(VER_PAT.match(v.version).group(1)))
    return out


def get_shot_versions(shot_id: str) -> List[ProVersion]:
    return _load_versions(shot_id)


def get_latest_version_of_shot(shot_id: str) -> Optional[str]:
    versions = _load_versions(shot_id)
    if not versions:
        return None
    return max(versions, key=lambda v: int(VER_PAT.match(v.version).group(1))).version


def list_shots() -> List[ProShot]:
    out: List[ProShot] = []
    for item in _db().list(NS_SHOT):
        item.pop("_id", None)
        out.append(ProShot(**{k: v for k, v in item.items() if k in ProShot.__dataclass_fields__}))
    return out


def get_shot(shot_id: str) -> Optional[ProShot]:
    item = _db().get(NS_SHOT, shot_id)
    if item is None:
        return None
    item.pop("_id", None)
    return ProShot(**{k: v for k, v in item.items() if k in ProShot.__dataclass_fields__})


def list_assets() -> List[ProAsset]:
    out: List[ProAsset] = []
    for item in _db().list(NS_ASSET):
        item.pop("_id", None)
        out.append(ProAsset(**{k: v for k, v in item.items() if k in ProAsset.__dataclass_fields__}))
    return out


def list_deliveries() -> List[ProDelivery]:
    out: List[ProDelivery] = []
    for item in _db().list(NS_DELIVERY):
        item.pop("_id", None)
        out.append(
            ProDelivery(**{k: v for k, v in item.items() if k in ProDelivery.__dataclass_fields__})
        )
    return sorted(out, key=lambda d: d.delivered_at, reverse=True)


def reset_ledger() -> None:
    """测试用：清空台账。"""
    db = _db()
    for ns in (NS_SHOT, NS_VERSION, NS_ASSET, NS_DELIVERY):
        db.clear(ns)


if __name__ == "__main__":
    # 自测版本排序
    assert version_sort_key("v001") < version_sort_key("v002")
    assert version_sort_key("v010") > version_sort_key("v003")
    assert version_sort_key("v100") > version_sort_key("v099")
    try:
        version_sort_key("ver3")
        print("ERROR: 未拦截非法版本号")
    except ValueError:
        print("VERSION CHECK OK")