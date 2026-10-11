# -*- coding: utf-8 -*-
# tests/test_p3_plan.py —— 校验 P3 规划中的基线事实与代码路径
# 作用：规划文档里的数字与文件路径会随实现漂移，文档不得变成谎言。
from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from web.backend.main import create_app

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "P3-Plan.md"


@pytest.fixture(scope="module")
def doc() -> str:
    assert DOC.exists(), f"P3 规划不存在: {DOC}"
    return DOC.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def route_count() -> int:
    app = create_app()
    return len({f"{sorted(r.methods)[0]} {r.path}" for r in app.routes if hasattr(r, "methods")})


class TestBaselineNumbers:
    """规划中声称的基线数字必须与真实一致。"""

    def test_route_count_claim_matches(self, doc, route_count):
        match = re.search(r"后端路由\s*(\d+)\s*条", doc)
        assert match, "规划未声明路由基线"
        claimed = int(match.group(1))
        assert claimed == route_count, (
            f"规划声称 {claimed} 条路由，实际 {route_count} 条。"
            "请同步更新 docs/P3-Plan.md 中的基线。"
        )

    def test_test_count_claim_is_plausible(self, doc):
        """
        用例数为快照，此处只做合理性检查（不得低于既有基线）。
        "测试数量是否倒退"由 CI 的真实运行结果保证，不在单测内递归跑套件。
        """
        match = re.search(r"(\d+)\s*用例通过", doc)
        assert match, "规划未声明用例基线"
        claimed = int(match.group(1))
        assert claimed >= 500, f"声称的用例数过低: {claimed}"


class TestReferencedPathsExist:
    """规划中引用的代码路径必须真实存在。"""

    def test_new_module_paths_exist_or_marked_new(self, doc):
        # `providers/` 在 P3-1 中被标为新增，尚未存在；其余应为既有路径
        expected_existing = [
            "web/backend/audio/engine.py",
            "web/backend/audio/synthesizer.py",
            "web/backend/collab/presence.py",
            "web/backend/game_assets/specs.py",
        ]
        missing = [p for p in expected_existing if not (ROOT / p).exists()]
        assert not missing, f"规划引用的以下既有路径不存在: {missing}"

    def test_marks_planned_modules_as_new(self, doc):
        # providers/ 与 ws.py 属计划新增，文档必须明确标注
        assert "providers/" in doc
        assert "新增" in doc

    def test_referenced_test_files_exist(self, doc):
        for f in ("tests/test_audio.py", "tests/test_docs_coverage.py"):
            assert (ROOT / f).exists(), f"规划引用的测试文件不存在: {f}"


class TestPlanSubstance:
    """规划不能是空话，必须有可验收内容。"""

    def test_has_work_items(self, doc):
        for item in ("P3-1", "P3-2", "P3-3", "P3-4", "P3-5"):
            assert f"### {item}" in doc, f"缺少工作项 {item}"

    def test_every_work_item_has_acceptance_criteria(self, doc):
        """每个工作项都必须有验收标准，否则无法判断完成。"""
        items = re.split(r"\n### P3-\d", doc)[1:]
        for block in items:
            assert "验收标准" in block, "存在没有验收标准的工作项"

    def test_has_execution_order(self, doc):
        assert "执行顺序" in doc

    def test_has_explicit_non_goals(self, doc):
        assert "明确不做" in doc

    def test_identifies_external_blockers(self, doc):
        assert "外部阻塞" in doc

    def test_changelog_referenced(self, doc):
        assert "CHANGELOG.md" in doc

    def test_api_doc_sync_enforced(self, doc):
        # P3 改接口必须同步文档，且这是测试强制的
        assert "test_docs_coverage" in doc


class TestDocStructure:
    def test_no_placeholders(self, doc):
        for bad in ("TODO", "TBD", "FIXME"):
            assert bad not in doc, f"残留占位符: {bad}"

    def test_code_blocks_balanced(self, doc):
        assert doc.count("```") % 2 == 0, "代码块未闭合"

    def test_no_trailing_whitespace(self, doc):
        bad = [i + 1 for i, l in enumerate(doc.splitlines()) if l != l.rstrip()]
        assert not bad, f"以下行有行尾空格: {bad[:10]}"