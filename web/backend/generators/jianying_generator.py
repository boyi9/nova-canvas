"""剪映草稿构建器（最小实现）。

为三源混剪编排（NC-HYB-07）与合规闸门（NC-HYB-08）提供 Python 侧
草稿写入能力。MVP 阶段输出结构化 JSON 草稿；字段命名与剪映
draft_content.json 对齐，P1 可无缝切换到完整草稿格式。
"""

import json
import os
from typing import List, Optional, Dict, Any


class Segment:
    """时间线上的一个素材片段，保留来源元数据以支持"只重做这一段"。"""

    def __init__(self, asset_path: str, start: float, duration: float,
                 name: str = "", color: Optional[str] = None,
                 meta: Optional[Dict[str, Any]] = None):
        self.asset_path = asset_path
        self.start = start
        self.duration = duration
        self.name = name
        self.color = color
        self.meta: Dict[str, Any] = dict(meta or {})

    def set_meta(self, key: str, value: Any) -> None:
        self.meta[key] = value

    def to_dict(self) -> dict:
        return {
            "asset_path": self.asset_path,
            "start": self.start,
            "duration": self.duration,
            "name": self.name,
            "color": self.color,
            "meta": self.meta,
        }


class Track:
    def __init__(self, kind: str, name: str = ""):
        self.kind = kind            # video / audio / overlay / text
        self.name = name
        self.segments: List[Segment] = []

    def add_segment(self, asset_path: str, start: float, duration: float,
                    name: str = "", color: Optional[str] = None,
                    meta: Optional[Dict[str, Any]] = None) -> Segment:
        seg = Segment(asset_path, start, duration, name, color, meta)
        self.segments.append(seg)
        return seg

    def to_dict(self) -> dict:
        return {"kind": self.kind, "name": self.name,
                "segments": [s.to_dict() for s in self.segments]}


class JianyingDraftBuilder:
    def __init__(self, draft_name: str, width: int = 1080, height: int = 1920,
                 fps: int = 30):
        self.draft_name = draft_name
        self.width = width
        self.height = height
        self.fps = fps
        self.tracks: List[Track] = []
        self.audios: List[dict] = []
        self.texts: List[dict] = []

    def add_track(self, kind: str, name: str = "") -> Track:
        tr = Track(kind, name)
        self.tracks.append(tr)
        return tr

    def add_audio(self, kind: str, path: str, volume: float = 1.0) -> None:
        self.audios.append({"kind": kind, "path": path, "volume": volume})

    def add_text(self, track: str, text: str, start: float, duration: float,
                 position: str = "top_right", font_size: int = 28,
                 opacity: float = 1.0) -> None:
        """写入叠加字幕（AI 标识等）。"""
        self.texts.append({
            "track": track, "text": text, "start": start,
            "duration": duration, "position": position,
            "font_size": font_size, "opacity": opacity,
        })

    def save(self, out_dir: str) -> str:
        """写出草稿 JSON，返回草稿文件路径。"""
        draft_dir = os.path.join(out_dir, self.draft_name)
        os.makedirs(draft_dir, exist_ok=True)
        path = os.path.join(draft_dir, "draft_content.json")
        payload = {
            "draft_name": self.draft_name,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "tracks": [t.to_dict() for t in self.tracks],
            "audios": self.audios,
            "texts": self.texts,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return path