# -*- coding: utf-8 -*-
# file: backend/models/pro_models.py
# 作用：专业管线相关数据模型
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from enum import Enum


class DCCType(str, Enum):
    AE = "after_effects"
    NUKE = "nuke"
    MAYA = "maya"


class PipelineType(str, Enum):
    AE_NUKE = "ae_nuke"
    MAYA_NUKE = "maya_nuke"


class TaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class RenderTier(str, Enum):
    LOCAL = "local"
    CLOUD = "cloud"
    CPU_FALLBACK = "cpu_fallback"


@dataclass
class PipelineJob:
    """专业管线作业"""
    job_id: str
    pipeline: str              # ae_nuke / maya_nuke
    shot_id: str
    version: str = "v001"
    template: str = ""
    assets: Dict[str, str] = field(default_factory=dict)
    actions: List[str] = field(default_factory=list)
    license_ok: bool = False
    color_config: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "pending"


@dataclass
class ProShot:
    shot_id: str
    project_id: str
    scene: str
    description: str
    status: str = "waiting"


@dataclass
class ProVersion:
    shot_id: str
    version: str
    process_type: str
    engine_file: str
    render_path: str
    color_config: str
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ProAsset:
    asset_id: str
    type: str
    source: str
    license: str
    path: str


@dataclass
class ProDelivery:
    delivery_id: str
    shot_id: str
    version: str
    files: List[str] = field(default_factory=list)
    channel_manifest: Dict = field(default_factory=dict)
    delivered_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RenderTask:
    task_id: str
    pipeline: str
    shot_id: str
    version: str
    priority: int = 1
    payload: Dict = field(default_factory=dict)
    status: str = "pending"
    retry_count: int = 0
    max_retries: int = 2
    render_tier: str = "local"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    render_tier: str = "local"
    assigned_node: Optional[str] = None
    cost_estimate: float = 0.0
    actual_cost: float = 0.0