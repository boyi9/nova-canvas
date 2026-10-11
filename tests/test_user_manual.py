# -*- coding: utf-8 -*-
# tests/test_user_manual.py —— 校验用户手册中的事实性声明与代码一致
# 作用：路由、端口、npm scripts 等硬事实会随实现变化，文档不得漂移。
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DOC = WEB / "docs" / "user" / "user-manual.md"


@pytest.fixture(scope="module")
def doc() -> str:
    assert DOC.exists(), f"用户手册不存在: {DOC}"
    return DOC.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def package_json() -> dict:
    return json.loads((WEB / "package.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def router_paths() -> set:
    """从 router.tsx 提取实际前端路由。"""
    text = (WEB / "src" / "router.tsx").read_text(encoding="utf-8")
    return set(re.findall(r'path:\s*"([^"]+)"', text))


class TestDocumentedRoutesExist:
    """手册表格里的每个前端路由都必须真实存在。"""

    def test_routes_documented_and_valid(self, doc, router_paths):
        # 只校验形如 `/<word>` 的路径（跳过 http:// 等）
        documented = set(re.findall(r"`(/(?:[a-z-]+)(?::\w+)?)`", doc))
        missing = sorted(p for p in documented if p not in router_paths)
        assert not missing, "手册中的以下路由在 router.tsx 中不存在:\n" + "\n".join(missing)

    def test_documents_at_least_ten_routes(self, doc):
        documented = set(re.findall(r"`(/(?:[a-z-]+)(?::\w+)?)`", doc))
        assert len(documented) >= 10, f"手册覆盖路由过少: {len(documented)}"


class TestPortsAndUrls:
    def test_frontend_dev_port_matches_package_json(self, doc, package_json):
        dev = package_json["scripts"]["dev"]
        assert "--port 5173" in dev, f"dev script 端口变了: {dev}"
        assert "5173" in doc

    def test_preview_port_documented(self, doc, package_json):
        start = package_json["scripts"].get("start", "")
        m = re.search(r"--port (\d+)", start)
        assert m, f"start script 无端口: {start}"
        assert m.group(1) in doc, f"手册未提及预览端口 {m.group(1)}"

    def test_backend_port_documented(self, doc):
        # main.py 启动说明使用 8000
        main_py = (WEB / "backend" / "main.py").read_text(encoding="utf-8")
        assert "8000" in main_py
        assert "8000" in doc

    def test_api_docs_url_documented(self, doc):
        assert "/api/docs" in doc
        assert "/api/health" in doc
        assert "/api/openapi.json" in doc


class TestScriptsDocumented:
    def test_documented_scripts_exist(self, doc, package_json):
        scripts = package_json["scripts"]
        for script in re.findall(r"npm run ([a-z0-9:]+)", doc):
            assert script in scripts, f"手册引用了不存在的 script: npm run {script}"

    def test_documents_verification_commands(self, doc):
        assert "npm run typecheck" in doc
        assert "npm run build" in doc


class TestFeatureClaims:
    def test_collab_tabs_documented(self, doc):
        for tab in ("成员", "分享", "版本", "审批", "排期"):
            assert tab in doc, f"缺少协作文档章节: {tab}"

    def test_rbac_roles_documented(self, doc):
        for role in ("owner", "editor", "viewer"):
            assert role in doc

    def test_red_line_documented(self, doc):
        assert "红线" in doc

    def test_audio_limits_documented(self, doc):
        # 2000 字上限必须写明，用户会撞到
        assert "2000" in doc

    def test_audio_demo_limitation_documented(self, doc):
        assert "本地" in doc and "正弦波" in doc

    def test_audio_atomicity_documented(self, doc):
        assert "回滚" in doc

    def test_game_asset_boundary_documented(self, doc):
        assert "规格计算" in doc

    def test_presence_limitation_documented(self, doc):
        assert "轮询" in doc

    def test_idempotency_documented(self, doc):
        assert "幂等" in doc

    def test_git_hook_workaround_documented(self, doc):
        # 这个坑真的会发生过，必须写进 FAQ
        assert "core.hooksPath" in doc


class TestRoleClaims:
    """手册的角色能力表必须与 ROLE_PERMISSIONS 一致。"""

    def test_editor_cannot_do_owner_only_actions(self, doc):
        """editor 的"不能做"必须覆盖所有 owner 专属权限域。"""
        from web.backend.collab.permissions import ROLE_PERMISSIONS

        owner_only = sorted(ROLE_PERMISSIONS["owner"] - ROLE_PERMISSIONS["editor"])
        assert owner_only, "预期存在 owner 专属权限"

        # 取 editor 所在表格行
        editor_line = next(
            (l for l in doc.splitlines() if l.startswith("| **editor**")), None
        )
        assert editor_line, "手册缺少 editor 角色行"

        cells = [c.strip() for c in editor_line.split("|")]
        cannot = cells[3] if len(cells) > 3 else ""
        cannot_cn = cannot
        # 权限域 -> 中文动作描述
        domain_cn = {
            "member": "成员",
            "share": "分享",
            "version:rollback": "回滚",
            "approval:review": "裁决",
            "schedule": "排期",
            "publish:execute": "发布",
            "project:delete": "删除",
        }
        missing = []
        for perm in owner_only:
            kw = domain_cn.get(perm)
            if kw and kw not in cannot_cn:
                missing.append(f"{perm}（应提及 '{kw}'）")
        assert not missing, "editor 的'不能做'列缺失:\n" + "\n".join(missing)

    def test_viewer_read_only(self, doc):
        viewer_line = next(
            (l for l in doc.splitlines() if l.startswith("| **viewer**")), None
        )
        assert viewer_line, "手册缺少 viewer 角色行"
        assert "写操作" in viewer_line

    def test_red_line_actions_documented(self, doc):
        for kw in ("发布", "移除", "删除"):
            assert kw in doc


class TestDocStructure:
    def test_has_toc(self, doc):
        assert "## 目录" in doc

    def test_no_placeholder_todos(self, doc):
        for bad in ("TODO", "TBD", "FIXME", "待补充"):
            assert bad not in doc, f"残留占位符: {bad}"

    def test_code_blocks_balanced(self, doc):
        assert doc.count("```") % 2 == 0, "代码块 ``` 未闭合"

    def test_no_trailing_whitespace(self, doc):
        bad = [i + 1 for i, l in enumerate(doc.splitlines()) if l != l.rstrip()]
        assert not bad, f"以下行有行尾空格: {bad[:10]}"

    def test_references_api_reference(self, doc):
        assert "p2-reference.md" in doc