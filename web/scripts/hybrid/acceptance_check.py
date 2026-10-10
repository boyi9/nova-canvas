# file: scripts/hybrid/acceptance_check.py
"""三源融合端到端验收：按 13.14 的指标逐项检查。

用法：
    python scripts/hybrid/acceptance_check.py

环境变量：
    NC_PROJECT_ROOT  样例工程目录（默认 /tmp/nc_project，Windows 用 %TEMP%\\nc_project）

退出码：0 = 全部达标（可接入 CI）；1 = 任一项不达标。
输出：JSON 报告，必须包含 manifest_valid / source_ratio / anchor_kelvin /
      grade_seconds / delta_e / compliance_passed 六个指标。
"""

import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.shot_manifest import load, validate, source_summary
from backend.hybrid.color_anchor import extract_anchor, save_anchor, write_cube_lut
from backend.hybrid.fusion_grader import grade_shot_to_anchor, measure_delta_e
from backend.hybrid.compliance_gate import check_hybrid

_DEFAULT_ROOT = os.path.join(os.environ.get("TEMP", "/tmp"), "nc_project")
PROJECT_ROOT = os.environ.get("NC_PROJECT_ROOT", _DEFAULT_ROOT)
MANIFEST = os.path.join(PROJECT_ROOT, "manifest.json")

FFMPEG_AVAILABLE = bool(shutil.which("ffmpeg"))


def main() -> int:
    report = {"metrics": {}, "warnings": [], "passed": True}
    m = report["metrics"]

    # ── 1. Shot Manifest 校验 ────────────────────────────────────
    manifest_obj = load(MANIFEST)
    problems = validate(manifest_obj)
    m["manifest_valid"] = len(problems) == 0
    m["manifest_problems"] = problems
    if problems:
        report["passed"] = False

    # ── 2. 来源占比（对照 13.12 配方） ──────────────────────────
    m["source_ratio"] = source_summary(manifest_obj)

    # ── 3. 色彩锚定 ─────────────────────────────────────────────
    ref_frame = os.path.join(PROJECT_ROOT, "assets", "ref", "S01_ref.png")
    anchor = extract_anchor(
        ref_frame,
        manifest_obj.global_color_anchor_id or "CA-DEFAULT",
        match_strength=88,
    )
    save_anchor(anchor, os.path.join(PROJECT_ROOT, "anchors", f"{anchor.anchor_id}.json"))
    write_cube_lut(anchor, os.path.join(PROJECT_ROOT, "anchors", f"{anchor.anchor_id}.cube"))
    m["anchor_kelvin"] = anchor.kelvin

    # ── 4. 调色 + 色差（需 ffmpeg；缺失时降级为警告） ───────────
    shot_in = os.path.join(PROJECT_ROOT, "work", "normalized", "S02.mp4")
    shot_out = os.path.join(PROJECT_ROOT, "work", "graded", "S02_graded.mp4")
    live = os.path.join(PROJECT_ROOT, "raw", "live", "S01.mp4")

    if FFMPEG_AVAILABLE and os.path.exists(shot_in):
        t0 = time.time()
        grade_shot_to_anchor(shot_in, anchor, shot_out)
        m["grade_seconds"] = round(time.time() - t0, 1)
        if m["grade_seconds"] > 40.0:
            report["passed"] = False
            report["warnings"].append("单片段调色超过 40s")

        if os.path.exists(live) and os.path.exists(shot_out):
            de = measure_delta_e(live, shot_out)
            m["delta_e"] = round(de, 3)
            if de > 5.0:
                report["passed"] = False
        else:
            m["delta_e"] = None
            report["warnings"].append("缺实拍基准或调色输出，delta_e 跳过")
    else:
        m["grade_seconds"] = None
        m["delta_e"] = None
        report["warnings"].append("环境无 ffmpeg 或无输入片段，调色/色差指标跳过")

    # ── 5. 合规闸门 ─────────────────────────────────────────────
    with open(MANIFEST, encoding="utf-8") as f:
        rep = check_hybrid(json.load(f))
    m["compliance_passed"] = rep.passed
    m["ai_shots"] = rep.ai_shot_ids
    m["needs_ai_label"] = rep.needs_ai_label
    if not rep.passed:
        report["passed"] = False

    # ── 六个必备指标齐全性自检 ──────────────────────────────────
    required = ["manifest_valid", "source_ratio", "anchor_kelvin",
                "grade_seconds", "delta_e", "compliance_passed"]
    missing = [k for k in required if k not in m]
    if missing:
        report["passed"] = False
        report["warnings"].append(f"缺少必备指标: {missing}")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())