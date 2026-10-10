"""远程导播与拍摄指导：免登录上传、取景框叠加、实时参数下发。"""
from __future__ import annotations

import hashlib
import os
import secrets
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path


@dataclass
class UploadToken:
    """一次性上传凭证。"""
    token: str
    task_id: str
    shot_id: str
    expires_at: str
    used: bool = False
    upload_path: str = ""


@dataclass
class ShootDirection:
    """远程导播指令。"""
    direction_type: str  # param_adjust / teleprompt / ng_mark / retake
    payload: Dict[str, Any]
    timestamp: str


# Token 存储（生产环境用 Redis，开发用内存）
_token_store: Dict[str, UploadToken] = {}
_upload_dir = os.getenv("SHOOT_UPLOAD_DIR", "/tmp/nova_canvas/shoot_uploads")
Path(_upload_dir).mkdir(parents=True, exist_ok=True)


def generate_upload_token(
    task_id: str,
    shot_id: str,
    ttl_hours: int = 72,
) -> UploadToken:
    """生成免登录上传 Token。"""
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(hours=ttl_hours)

    upload_token = UploadToken(
        token=token,
        task_id=task_id,
        shot_id=shot_id,
        expires_at=expires.isoformat(),
        upload_path=os.path.join(_upload_dir, task_id, shot_id),
    )
    Path(upload_token.upload_path).mkdir(parents=True, exist_ok=True)
    _token_store[token] = upload_token
    return upload_token


def validate_upload_token(token: str) -> Optional[UploadToken]:
    """验证上传 Token。"""
    ut = _token_store.get(token)
    if not ut:
        return None
    if ut.used:
        return None
    if datetime.now() > datetime.fromisoformat(ut.expires_at):
        return None
    return ut


def mark_token_used(token: str) -> bool:
    """标记 Token 已使用。"""
    ut = _token_store.get(token)
    if ut:
        ut.used = True
        return True
    return False


def save_uploaded_file(token: str, file_data: bytes, filename: str) -> str:
    """保存上传文件，返回文件路径。"""
    ut = validate_upload_token(token)
    if not ut:
        raise ValueError("Invalid or expired upload token")

    # 简单的文件名安全化
    safe_name = f"{ut.shot_id}_{int(time.time())}{Path(filename).suffix}"
    filepath = os.path.join(ut.upload_path, safe_name)

    with open(filepath, "wb") as f:
        f.write(file_data)

    # 计算 SHA256 用于完整性校验
    sha256 = hashlib.sha256(file_data).hexdigest()

    mark_token_used(token)
    return filepath


def generate_overlay_config(shot_card: Dict[str, Any]) -> Dict[str, Any]:
    """生成取景框叠加层配置（供前端相机预览使用）。"""
    # 根据景别计算主体占比区域
    subject_ratio = shot_card.get("subject_ratio_pct", 50) / 100.0
    negative_space = shot_card.get("negative_space", "右侧留白")

    # 计算安全区（主体区域）
    if negative_space == "右侧留白":
        safe_x = 0.1
        safe_w = subject_ratio
    elif negative_space == "左侧留白":
        safe_x = 1 - subject_ratio - 0.1
        safe_w = subject_ratio
    else:  # 居中
        safe_x = (1 - subject_ratio) / 2
        safe_w = subject_ratio

    return {
        "enabled": True,
        "opacity": 0.3,
        "reference_image": shot_card.get("ref_image", ""),
        "safe_zone": {
            "x": safe_x,
            "y": 0.2,
            "width": safe_w,
            "height": 0.6,
        },
        "grid": "rule_of_thirds",
        "crosshair": True,
        "level_indicator": True,
    }


@dataclass
class LivePreviewSession:
    """实时预览会话（WebRTC 信令用）。"""
    session_id: str
    task_id: str
    shot_id: str
    offer_sdp: str = ""
    answer_sdp: str = ""
    ice_candidates: List[Dict] = None
    created_at: str = ""
    status: str = "pending"  # pending/connected/closed

    def __post_init__(self):
        if self.ice_candidates is None:
            self.ice_candidates = []
        if not self.created_at:
            self.created_at = datetime.now().isoformat()


_preview_sessions: Dict[str, LivePreviewSession] = {}


def create_preview_session(
    task_id: str,
    shot_id: str,
    offer_sdp: str,
) -> LivePreviewSession:
    """创建实时预览会话。"""
    session_id = secrets.token_urlsafe(16)
    session = LivePreviewSession(
        session_id=session_id,
        task_id=task_id,
        shot_id=shot_id,
        offer_sdp=offer_sdp,
    )
    _preview_sessions[session_id] = session
    return session


def get_preview_session(session_id: str) -> Optional[LivePreviewSession]:
    return _preview_sessions.get(session_id)


def update_preview_session(
    session_id: str,
    answer_sdp: str = "",
    ice_candidate: Optional[Dict] = None,
) -> Optional[LivePreviewSession]:
    session = _preview_sessions.get(session_id)
    if not session:
        return None
    if answer_sdp:
        session.answer_sdp = answer_sdp
    if ice_candidate:
        session.ice_candidates.append(ice_candidate)
    return session


def close_preview_session(session_id: str) -> bool:
    session = _preview_sessions.pop(session_id, None)
    if session:
        session.status = "closed"
        return True
    return False


def send_direction(
    task_id: str,
    shot_id: str,
    direction_type: str,
    payload: Dict[str, Any],
) -> ShootDirection:
    """发送导播指令（由导播端调用，推送到拍摄端）。"""
    direction = ShootDirection(
        direction_type=direction_type,
        payload=payload,
        timestamp=datetime.now().isoformat(),
    )
    # 实际项目中通过 WebSocket/Server-Sent Events 推送到拍摄端
    return direction


# 导播指令类型常量
DIRECTION_TYPES = {
    "param_adjust": "参数调整（白平衡/曝光/对焦模式）",
    "teleprompt": "推送提词器内容",
    "ng_mark": "标记 NG",
    "retake": "要求重拍",
    "pause": "暂停拍摄",
    "resume": "继续拍摄",
}


if __name__ == "__main__":
    # Demo
    token = generate_upload_token("TASK-001", "S07")
    print(f"Upload token: {token.token}")
    print(f"Expires: {token.expires_at}")
    print(f"Upload path: {token.upload_path}")

    # 验证
    ut = validate_upload_token(token.token)
    print(f"Valid: {ut is not None}")

    # 取景框配置
    shot_card = {
        "subject_ratio_pct": 70,
        "negative_space": "右侧留白",
        "ref_image": "ref_S07.jpg",
    }
    overlay = generate_overlay_config(shot_card)
    print(f"Overlay config: {overlay}")