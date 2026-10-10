"""NC-HYB-09 单元测试：端到端验收脚本。

验收标准（执行方案 772-775 行）：
- python scripts/hybrid/acceptance_check.py 在样例工程上返回 0
- 输出 JSON 必须包含 manifest_valid / source_ratio / anchor_kelvin /
  grade_seconds / delta_e / compliance_passed 六个指标
- 任一项不达标返回码为 1（可接入 CI）
"""

import json
import os
import subprocess
import sys

WEB_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUILD = os.path.join(WEB_ROOT, "scripts", "hybrid", "build_sample_project.py")
CHECK = os.path.join(WEB_ROOT, "scripts", "hybrid", "acceptance_check.py")

SIX_METRICS = ["manifest_valid", "source_ratio", "anchor_kelvin",
               "grade_seconds", "delta_e", "compliance_passed"]


def test_build_sample_project(tmp_path):
    r = subprocess.run([sys.executable, BUILD, str(tmp_path / "proj")],
                       capture_output=True, text=True, cwd=WEB_ROOT)
    assert r.returncode == 0, f"样例工程构建失败: {r.stderr}"
    assert os.path.exists(tmp_path / "proj" / "manifest.json")
    assert os.path.exists(tmp_path / "proj" / "assets" / "ref" / "S01_ref.png")
    print(f"✓ 样例工程构建: {r.stdout.strip()}")


def test_acceptance_returns_0_with_six_metrics(tmp_path):
    root = str(tmp_path / "proj")
    r = subprocess.run([sys.executable, BUILD, root],
                       capture_output=True, text=True, cwd=WEB_ROOT)
    assert r.returncode == 0, f"构建失败: {r.stderr}"

    env = dict(os.environ, NC_PROJECT_ROOT=root)
    r2 = subprocess.run([sys.executable, CHECK],
                        capture_output=True, text=True, cwd=WEB_ROOT, env=env)
    assert r2.returncode == 0, \
        f"验收应返回 0，实际 {r2.returncode}\nstdout={r2.stdout}\nstderr={r2.stderr}"

    report = json.loads(r2.stdout)
    assert report["passed"] is True
    for key in SIX_METRICS:
        assert key in report["metrics"], f"缺少必备指标 {key}: {list(report['metrics'])}"
    assert report["metrics"]["manifest_valid"] is True
    assert report["metrics"]["compliance_passed"] is True
    assert isinstance(report["metrics"]["source_ratio"], dict)
    assert report["metrics"]["anchor_kelvin"] > 0
    print(f"✓ 验收返回 0，六指标齐全: {list(report['metrics'])}")


def test_acceptance_fails_on_bad_manifest(tmp_path):
    """任一项不达标 → 返回码 1。"""
    root = str(tmp_path / "proj")
    subprocess.run([sys.executable, BUILD, root],
                   capture_output=True, text=True, cwd=WEB_ROOT)

    # 破坏合规：把实拍镜头的肖像授权置空
    mp = os.path.join(root, "manifest.json")
    with open(mp, encoding="utf-8") as f:
        data = json.load(f)
    for s in data["shots"]:
        if s["source"] == "live_action":
            s["compliance"]["talent_release"] = False
    with open(mp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    env = dict(os.environ, NC_PROJECT_ROOT=root)
    r = subprocess.run([sys.executable, CHECK],
                       capture_output=True, text=True, cwd=WEB_ROOT, env=env)
    assert r.returncode == 1, f"缺授权时应返回 1，实际 {r.returncode}"
    report = json.loads(r.stdout)
    assert report["passed"] is False
    assert report["metrics"]["compliance_passed"] is False
    print("✓ 缺授权时验收返回 1（CI 可拦截）")


if __name__ == "__main__":
    print("本测试需在 pytest 下运行（依赖 tmp_path）")