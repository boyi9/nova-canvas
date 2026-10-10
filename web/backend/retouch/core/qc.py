# -*- coding: utf-8 -*-
# file: backend/retouch/core/qc.py
# 作用：NC-RET-06 修图质检闸门（附录 B，已实测）—— 防塑料感 / 防没修到位
from __future__ import annotations

from typing import Dict, List

from .frequency import spot_contrast, texture_energy

# 三档判定阈值（上线前需用 30 组真实样本标定；此处为工程初值）
THRESHOLDS = dict(
    keep_warn=0.85,
    keep_reject=0.70,   # 纹理保留率
    spot_warn=0.30,
    spot_reject=0.60,   # 斑点去除率
)

_ORDER = {"pass": 0, "warn": 1, "reject": 2}


def qc_retouch(before, after, ops) -> Dict:
    """量化判定修图结果是否可交付。"""
    ops = ops or []
    keep = texture_energy(after) / max(texture_energy(before), 1e-6)
    removed = 1.0 - spot_contrast(after) / max(spot_contrast(before), 1e-6)

    verdict, findings = "pass", []

    def downgrade(v: str) -> str:
        return v if _ORDER[v] > _ORDER[verdict] else verdict

    if any(o in ops for o in ("skin_smooth", "blemish_remove")):
        if keep < THRESHOLDS["keep_reject"]:
            verdict = "reject"
            findings.append(
                "纹理保留率 %.0f%% 低于阈值 %d%%，存在塑料感，已打回"
                % (keep * 100, THRESHOLDS["keep_reject"] * 100)
            )
        elif keep < THRESHOLDS["keep_warn"]:
            verdict = downgrade("warn")
            findings.append("纹理保留率 %.0f%% 偏低，建议降低磨皮强度" % (keep * 100))
    if "blemish_remove" in ops and removed < THRESHOLDS["spot_warn"]:
        verdict = downgrade("warn")
        findings.append("斑点去除率 %.0f%% 偏低，建议提高祛斑强度" % (removed * 100))
    if not findings:
        findings.append(
            "纹理保留率 %.0f%%、斑点去除率 %.0f%%，各项达标" % (keep * 100, removed * 100)
        )
    return dict(
        verdict=verdict,
        texture_keep=round(keep, 3),
        spot_removed=round(removed, 3),
        findings=findings,
    )
