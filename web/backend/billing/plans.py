# -*- coding: utf-8 -*-
# file: backend/billing/plans.py
# 作用：会员套餐目录 —— free / pro / team（价格、权益、配额）
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class PlanDef:
    id: str
    name_cn: str
    name_en: str
    price_cny_month: int  # 单位：分（避免浮点）；0 = 免费
    price_cny_year: int
    features_cn: List[str] = field(default_factory=list)
    features_en: List[str] = field(default_factory=list)
    # 配额（演示用：生成次数/月、项目数、协作席位）
    quota_images_month: int = 100
    quota_videos_month: int = 10
    quota_projects: int = 10
    quota_seats: int = 1
    highlight: bool = False


PLAN_CATALOG: Dict[str, PlanDef] = {
    "free": PlanDef(
        id="free",
        name_cn="免费版",
        name_en="Free",
        price_cny_month=0,
        price_cny_year=0,
        features_cn=["每月 100 张生图", "10 个项目", "基础模板"],
        features_en=["100 images/mo", "10 projects", "Basic templates"],
        quota_images_month=100,
        quota_videos_month=2,
        quota_projects=10,
        quota_seats=1,
    ),
    "pro": PlanDef(
        id="pro",
        name_cn="专业版",
        name_en="Pro",
        price_cny_month=9900,  # ¥99/月
        price_cny_year=99000,  # ¥990/年
        features_cn=["每月 2000 张生图", "100 个项目", "全部模板", "优先队列"],
        features_en=["2000 images/mo", "100 projects", "All templates", "Priority queue"],
        quota_images_month=2000,
        quota_videos_month=50,
        quota_projects=100,
        quota_seats=1,
        highlight=True,
    ),
    "team": PlanDef(
        id="team",
        name_cn="团队版",
        name_en="Team",
        price_cny_month=29900,  # ¥299/月
        price_cny_year=299000,  # ¥2990/年
        features_cn=["无限生图", "无限项目", "10 席位协作", "专属支持"],
        features_en=["Unlimited images", "Unlimited projects", "10 seats", "Dedicated support"],
        quota_images_month=10**9,
        quota_videos_month=10**6,
        quota_projects=10**6,
        quota_seats=10,
    ),
}


def get_plan(plan_id: str) -> PlanDef:
    plan = PLAN_CATALOG.get(plan_id)
    if plan is None:
        raise KeyError(f"未知套餐: {plan_id}")
    return plan


def list_plans() -> List[PlanDef]:
    return list(PLAN_CATALOG.values())
