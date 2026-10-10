"""三源融合引擎数据契约。

此模块定义了整个流水线的单一事实来源（Single Source of Truth）。
所有跨模块数据结构均使用 dataclass 承载，确保类型安全和序列化兼容性。
"""

from dataclasses import dataclass, field
from typing import List, Optional, Literal

# ── 素材来源枚举（全链路严格统一，禁止自造新值） ──────────────────────
SourceType = Literal[
    "live_action",        # 真人实拍
    "ai_generated",       # 纯 AI 生成
    "ai_pickup",          # AI 补镜（后期补拍）
    "hybrid_composite",   # 虚实合成（实拍 + AI 背景）
    "stock",              # 可商用素材库
]

# ── 镜头功能枚举 ────────────────────────────────────────────────────────
ShotFunction = Literal[
    "hook",               # 黄金钩子（前 3 秒）
    "emotional_core",     # 情感核心（强情绪/近景特写/对手戏）
    "product_show",       # 产品展示
    "scene_establish",    # 环境交代
    "transition_bridge",  # 过渡衔接
    "cta",                # 结尾转化
]

# ── AI 来源标识集合 ────────────────────────────────────────────────────
AI_SOURCES = {"ai_generated", "ai_pickup", "hybrid_composite"}

# ── 情感核心镜头只允许实拍 ────────────────────────────────────────────
EMOTIONAL_CORE_ALLOWED = {"live_action"}


# ── 合规信息 ─────────────────────────────────────────────────────────────
@dataclass
class ComplianceInfo:
    """合规信息快照（随 Shot 附属，随工程变更而变）。"""
    needs_ai_label: bool = False          # 是否需要显式 AI 标识
    talent_release: bool = False          # 肖像授权
    voice_release: bool = False           # 声音授权
    bgm_license: Optional[str] = None     # BGM 授权来源标识
    product_is_real_shoot: bool = True    # 电商项目中，商品本体是否实拍


# ── 光照信息 ─────────────────────────────────────────────────────────────
@dataclass
class LightingInfo:
    """简化的光环境描述，用于色彩锚定与提示词生成。"""
    direction: str = "side_left"          # 光源方位
    kelvin: int = 5200                    # 色温
    shadow: str = "soft"                  # 阴影柔硬程度
    saturation: str = "medium_high"       # 饱和度水平


# ── 主体锁定 ─────────────────────────────────────────────────────────────
@dataclass
class SubjectLock:
    """对关键主体（如产品）的锁定约束，防止 AI 替换核心元素。"""
    product_id: str
    must_keep: List[str] = field(default_factory=lambda: ["logo", "color", "shape"])


# ── 单镜头数据结构 ──────────────────────────────────────────────────────
@dataclass
class Shot:
    """Shot Manifest 中的单条记录，是整个混合制作工程的原子单元。"""

    shot_id: str
    start_sec: float
    duration_sec: float
    function: ShotFunction
    source: SourceType                        # live_action / ai_generated / ...
    shot_size: str = "MS"                     # CU/MS/LS/ES 等
    camera_move: str = "static"               # slow_push_in / pan_left / static 等
    source_fallback: List[SourceType] = field(default_factory=list)
    risk_level: str = "low"
    subject_lock: Optional[SubjectLock] = None
    color_ref_frame: Optional[str] = None       # 色彩锚定参考帧路径
    scene_card_id: Optional[str] = None
    lighting: LightingInfo = field(default_factory=LightingInfo)
    ai_prompt: Optional[str] = None
    seed: Optional[int] = None              # 随机种子，确保可复现
    compliance: ComplianceInfo = field(default_factory=ComplianceInfo)


# ── 完整分镜清单 ─────────────────────────────────────────────────────────
@dataclass
class ShotManifest:
    """全局唯一的分镜来源标记清单——贯穿生成/调色/编排/合规的唯一事实来源。"""

    project_id: str
    project_type: str = "generic"           # ecommerce_short_video / ad_film / drama
    total_duration_sec: float = 0.0          # 0 表示未声明，校验时跳过时长一致性检查
    fps: int = 30
    resolution: str = "1080x1920"
    color_space: str = "Rec.709"
    global_color_anchor_id: Optional[str] = None
    shots: List[Shot] = field(default_factory=list)