"""拍摄任务卡：把分镜中 source=live 的镜头翻译成可执行的通告单。"""
from __future__ import annotations

import os
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, List

import yaml


# 加载配置
def _load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "data")
_SHOT_PARAMS = _load_yaml(os.path.join(_CONFIG_DIR, "shot_params.yaml"))
_DEVICE_CAPS = _load_yaml(os.path.join(_CONFIG_DIR, "device_caps.yaml"))

SHOT_SIZE_MAP = _SHOT_PARAMS.get("shot_size_map", {})
CAMERA_MOVE_MAP = _SHOT_PARAMS.get("camera_move_map", {})
DEVICE_FPS_CAP = {k: v.get("max_fps_4k", 60) for k, v in _DEVICE_CAPS.get("devices", {}).items()}


@dataclass
class ShotCard:
    """单镜拍摄任务卡，包含所有可执行参数。"""
    shot_id: str
    shot_size: str
    camera_move: str
    duration_sec: float
    camera_distance_m: float
    camera_height_m: float
    camera_angle: str
    gear: str
    fps: int
    shutter: str
    white_balance_k: int
    iso_max: int
    subject_ratio_pct: int
    negative_space: str
    ref_image: str
    audio: str
    notes: List[str]
    device_warning: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def build_shot_card(
    shot: Dict[str, Any],
    device: str = "generic_2026_flagship",
    project_id: str = "",
) -> ShotCard:
    """根据分镜数据生成拍摄任务卡。

    Args:
        shot: 分镜字典，含 shot_id/shot_size/camera_move/duration_sec/emotion/negative_space/ref_image/warnings/scene
        device: 用户机型标识，用于 FPS 能力校验
        project_id: 项目 ID，用于生成参考图文件名

    Returns:
        ShotCard 实例
    """
    size = shot.get("shot_size", "中景")
    move = shot.get("camera_move", "固定")
    dist, ratio, _ = SHOT_SIZE_MAP.get(size, (2.5, 50, ""))

    # 帧率：默认 60，强调镜头想用 120；但不得超过机型上限
    want_fps = 120 if shot.get("emotion") == "强调" else 60
    cap = DEVICE_FPS_CAP.get(device, DEVICE_FPS_CAP.get("default", 60))
    fps = min(want_fps, cap)
    warning = ""
    if want_fps > cap:
        warning = f"机型 {device} 上限 {cap}fps，已自动下调（原需 {want_fps}fps）"

    shutter = f"1/{2 * fps}s"
    wb = 5600 if shot.get("scene", "day") == "day" else 3200

    notes = []
    for w in shot.get("warnings", []):
        if "逆光" in w:
            notes.append("避免逆光：主体背对窗户")
        elif "反光" in w:
            notes.append("避免镜面反光：调整角度或加柔光")
    if size in ("特写", "近景"):
        notes.append("注意手指不要遮挡镜头与商品标签")

    shot_id = shot.get("shot_id", "S01")
    ref_image = shot.get("ref_image", f"{project_id}_ref_{shot_id}.jpg")

    return ShotCard(
        shot_id=shot_id,
        shot_size=size,
        camera_move=move,
        duration_sec=float(shot.get("duration_sec", 3.0)),
        camera_distance_m=dist,
        camera_height_m=1.5 if size in ("近景", "中景") else 1.2,
        camera_angle=shot.get("camera_angle", "前侧 30°"),
        gear=CAMERA_MOVE_MAP.get(move, "三脚架"),
        fps=fps,
        shutter=shutter,
        white_balance_k=wb,
        iso_max=800,
        subject_ratio_pct=ratio,
        negative_space=shot.get("negative_space", "右侧留白"),
        ref_image=ref_image,
        audio=shot.get("audio", "领夹麦，关闭空调与风扇"),
        notes=notes,
        device_warning=warning,
    )


def generate_shot_cards_from_manifest(
    manifest: Dict[str, Any],
    device: str = "generic_2026_flagship",
) -> List[ShotCard]:
    """从 Shot Manifest 批量生成所有 source=live 镜头的任务卡。

    同时为每个镜头创建 SHOOT 类型的接缝任务（需配合 handoff_bus 使用）。

    Returns:
        ShotCard 列表
    """
    cards = []
    project_id = manifest.get("project_id", "PRJ")
    for shot in manifest.get("shots", []):
        if shot.get("source") == "live_action":
            cards.append(build_shot_card(shot, device, project_id))
    return cards


if __name__ == "__main__":
    # Demo
    demo_shot = {
        "shot_id": "S07",
        "shot_size": "近景",
        "camera_move": "缓慢推近",
        "duration_sec": 3.2,
        "emotion": "强调",
        "negative_space": "右侧留白",
        "ref_image": "ref_S07.jpg",
        "scene": "day",
        "warnings": ["逆光", "反光"],
    }
    card = build_shot_card(demo_shot, device="generic_2026_flagship")
    print(card.to_dict())
    print("\n--- 旗舰机型 ---")
    card2 = build_shot_card(demo_shot, device="iphone_18_pro_max")
    print(card2.to_dict())