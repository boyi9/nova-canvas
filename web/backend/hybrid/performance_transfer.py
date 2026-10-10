"""实拍驱动 AI 表演迁移（NC-HYB-04）：让 AI 角色的动作/表情/口型与实拍主演严格一致。

主文档 13.7；执行方案批 3。
常量为硬性阈值，不得放宽。
"""

from dataclasses import dataclass

MIN_DRIVER_SEC = 3.0
MAX_DRIVER_SEC = 8.0
MIN_REF_WIDTH = 768
MIN_REF_HEIGHT = 512
FINGER_TRACKING_SAFE_MAX = 75.0
FINGER_TRACKING_HARD_LIMIT = 85.0     # 超过会指尖粘连/穿模

CREDITS_PER_SEC = 5
MIN_BILLABLE_SEC = 3.0                # 最低按 3 秒计费


@dataclass
class TransferRequest:
    driver_video: str            # 实拍驱动视频
    character_ref: str           # 角色参考图（或角色视频）
    out_path: str
    gestures: bool = True
    facial_expressiveness: int = 3
    finger_tracking: float = 50.0
    ref_is_video: bool = False


def validate(req: "TransferRequest", driver_duration: float,
             ref_w: int, ref_h: int, face_occlusion_ratio: float = 0.0) -> list:
    """前置校验，返回问题清单；空列表表示通过。

    5 类校验（缺一不可）：
      1. 驱动视频时长 3-8 秒，否则拒绝并提示重拍
      2. 角色参考图分辨率 >= 768x512，否则拒绝并提示更换
      3. 面部遮挡比例 <= 1/3，否则拒绝并提示重拍
      4. 手指追踪强度 <= 85%，否则拒绝（工程层自动钳制到 75%）
      5. 角色视频输入 + 姿态控制不可同时开启（自动关闭姿态控制）
    """
    problems = []
    if not (MIN_DRIVER_SEC <= driver_duration <= MAX_DRIVER_SEC):
        problems.append(
            f"驱动视频时长需在 {MIN_DRIVER_SEC}-{MAX_DRIVER_SEC}s，"
            f"当前 {driver_duration}s，请重拍"
        )
    if ref_w < MIN_REF_WIDTH or ref_h < MIN_REF_HEIGHT:
        problems.append(
            f"角色参考图分辨率需 >= {MIN_REF_WIDTH}x{MIN_REF_HEIGHT}，"
            f"当前 {ref_w}x{ref_h}，请更换"
        )
    if face_occlusion_ratio > 1 / 3:
        problems.append("面部遮挡超过 1/3，会导致表情丢失，请重拍")
    if req.finger_tracking > FINGER_TRACKING_HARD_LIMIT:
        problems.append(
            f"手指追踪强度不得超过 {FINGER_TRACKING_HARD_LIMIT}%，"
            f"否则指尖粘连/穿模"
        )
    if req.ref_is_video and req.gestures:
        problems.append("使用角色视频输入时，姿态控制不可用")
    return problems


def transfer(req: "TransferRequest") -> str:
    """调用 Runway Act-Two 类能力完成表演迁移。

    - 工程层自动钳制 finger_tracking 到 SAFE_MAX（75%）。
    - 角色视频输入时自动关闭姿态控制（gestures）。
    - 模型不可用时，异常信息包含 "act_two" 与原始错误。
    """
    gestures = req.gestures and not req.ref_is_video
    payload = {
        "driver_video": req.driver_video,
        "character_ref": req.character_ref,
        "gestures": gestures,
        "facial_expressiveness": req.facial_expressiveness,
        "finger_tracking": min(req.finger_tracking, FINGER_TRACKING_SAFE_MAX),
    }
    try:
        from backend.models.router import ModelRouter
    except ImportError as e:
        raise RuntimeError(
            f"act_two 模型不可用（models.router 已移除，尚未接入真实 provider 客户端）: {e}"
        ) from e
    try:
        ModelRouter().invoke("act_two", payload, out_path=req.out_path)
    except Exception as e:
        raise RuntimeError(f"act_two 调用失败: {e}") from e
    return req.out_path


def estimate_credits(duration_sec: float) -> int:
    """积分预估：5 积分/秒，最低按 3 秒计费。"""
    return int(max(duration_sec, MIN_BILLABLE_SEC) * CREDITS_PER_SEC)