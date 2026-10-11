# -*- coding: utf-8 -*-
# tests/test_docs_coverage.py —— 防止 API 文档与实现漂移
# 作用：文档中的每个 P2 端点都必须存在于 OpenAPI schema，反之亦然。
from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from web.backend.main import create_app

DOC_PATH = (
    Path(__file__).resolve().parents[1] / "web" / "docs" / "api" / "p2-reference.md"
)

P2_PREFIXES = ("/api/collab", "/api/audio", "/api/game-assets")

PATH_RE = re.compile(r"/api/(?:collab|audio|game-assets)[^\s`),;\"]*")


@pytest.fixture(scope="module")
def openapi_paths() -> dict:
    """提取 P2 端点的 {METHOD: {path_set}} 映射。"""
    schema = create_app().openapi()
    out: dict = {}
    for path, methods in schema["paths"].items():
        if not path.startswith(P2_PREFIXES):
            continue
        for method in methods:
            out.setdefault(method.upper(), set()).add(path)
    return out


@pytest.fixture(scope="module")
def all_templates(openapi_paths) -> set:
    templates: set = set()
    for paths in openapi_paths.values():
        templates |= paths
    return templates


@pytest.fixture(scope="module")
def doc_text() -> str:
    if not DOC_PATH.exists():
        pytest.fail(f"文档不存在: {DOC_PATH}")
    return DOC_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def doc_normalized(doc_text: str) -> str:
    """
    把反引号与表格管道符换成空格并压缩连续空白，
    使 `GET` | `/path` 这类表格写法可被 "GET /path" 检索到。
    """
    return re.sub(r"\s+", " ", doc_text.replace("`", " ").replace("|", " "))


def _doc_paths(doc: str) -> set:
    """提取文档中出现的所有 P2 路径候选（去查询串、去尾引号）。"""
    found = set()
    for m in PATH_RE.finditer(doc):
        path = m.group(0).split("?")[0].rstrip("/\"'.,")
        # 跳过仅 API 前缀本身的引用（如标题里的 `/api/collab`）
        if path.count("/") >= 3:
            found.add(path)
    return found


def _matches_template(concrete: str, template: str) -> bool:
    """
    判断 concrete 是否是 template 的具体化。
    `/api/collab/prj_001/members` 匹配 `/api/collab/{project_id}/members`。
    """
    c_parts = concrete.split("/")
    t_parts = template.split("/")
    if len(c_parts) != len(t_parts):
        return False
    for c, t in zip(c_parts, t_parts):
        if t.startswith("{") and t.endswith("}"):
            if not c:          # 具体值不能为空段
                return False
            continue
        if c != t:
            return False
    return True


def _path_exists(candidate: str, templates: set) -> bool:
    """候选路径要么本身就是模板，要么是某模板的具体化。"""
    if candidate in templates:
        return True
    return any(_matches_template(candidate, t) for t in templates)


class TestDocExists:
    def test_doc_file_present(self, doc_text):
        assert len(doc_text) > 3000, "文档内容过少，疑似被截断"

    def test_has_all_three_sections(self, doc_text):
        for heading in (
            "## 1. Collaboration API",
            "## 2. Audio API",
            "## 3. Game Assets API",
            "## 4. 错误码速查",
        ):
            assert heading in doc_text, f"缺少章节: {heading}"


class TestForwardCoverage:
    """OpenAPI 中的每个端点都必须在文档中出现。"""

    def test_every_endpoint_documented(self, openapi_paths, doc_normalized):
        missing = []
        total = 0
        for method, paths in sorted(openapi_paths.items()):
            for path in sorted(paths):
                total += 1
                if f"{method} {path}" not in doc_normalized:
                    missing.append(f"{method} {path}")
        assert not missing, "以下端点未在文档中:\n" + "\n".join(missing)

    def test_p2_endpoint_count_matches_doc_claim(self, openapi_paths, doc_text):
        actual = sum(len(p) for p in openapi_paths.values())
        assert actual > 0, "未提取到任何 P2 端点"
        match = re.search(r"(\d+)\s*个后端接口", doc_text)
        assert match, "文档未声明接口总数"
        claimed = int(match.group(1))
        assert claimed == actual, f"文档声称 {claimed} 个接口，实际 {actual} 个"


class TestReverseCoverage:
    """文档中出现的每个端点都必须真实存在（防止文档写错路径）。"""

    def test_no_phantom_endpoints(self, doc_text, all_templates):
        phantom = []
        for candidate in sorted(_doc_paths(doc_text)):
            if not _path_exists(candidate, all_templates):
                phantom.append(candidate)
        assert not phantom, "以下路径在文档中但实现不存在:\n" + "\n".join(phantom)

    def test_documented_paths_not_empty(self, doc_text):
        assert len(_doc_paths(doc_text)) >= 40, "文档路径提取过少，可能格式有误"

    def test_all_templates_fixture_non_empty(self, openapi_paths):
        # 43 个端点对应 37 个唯一路径（部分路径同 URL 不同方法）
        endpoints = sum(len(p) for p in openapi_paths.values())
        unique = len(set().union(*openapi_paths.values()))
        assert endpoints >= 40, f"P2 端点数过少: {endpoints}"
        assert unique >= 30, f"P2 唯一路径数过少: {unique}"


class TestErrorCodesDocumented:
    """错误码表必须覆盖实际使用的状态码。"""

    def test_common_status_codes_listed(self, doc_text):
        for code in ("400", "401", "403", "404", "409"):
            assert code in doc_text, f"缺少 {code} 说明"

    def test_mentions_red_line(self, doc_text):
        assert "红线" in doc_text, "文档应说明红线权限语义"

    def test_mentions_idempotency(self, doc_text):
        assert "幂等" in doc_text, "文档应说明渲染与排期的幂等性"

    def test_mentions_batch_rollback(self, doc_text):
        assert "回滚" in doc_text, "文档应说明批量规划的原子性"

    def test_mentions_404_vs_400_rationale(self, doc_text):
        assert "404" in doc_text and "400" in doc_text


class TestConventionsDocumented:
    def test_auth_header_documented(self, doc_text):
        assert "Authorization" in doc_text

    def test_base_url_documented(self, doc_text):
        assert "/api/docs" in doc_text

    def test_rbac_roles_documented(self, doc_text):
        for role in ("owner", "editor", "viewer"):
            assert role in doc_text

    def test_audio_known_limitation_noted(self, doc_text):
        # 必须说明当前是本地合成而非真实 TTS，避免误解
        assert "本地" in doc_text and "TTS" in doc_text

    def test_presence_limitation_noted(self, doc_text):
        assert "WebSocket" in doc_text, "文档应说明 presence 当前为 REST 轮询的局限"

    def test_documented_endpoint_count_is_accurate(self, openapi_paths, doc_text):
        actual = sum(len(p) for p in openapi_paths.values())
        assert str(actual) in doc_text


class TestPermissionsDocumented:
    """文档中出现的权限常量必须真实存在于 Permission 枚举。"""

    @pytest.fixture(scope="class")
    def real_permissions(self) -> set:
        from web.backend.collab import Permission

        return {v for k, v in vars(Permission).items() if not k.startswith("_") and isinstance(v, str)}

    def _permission_tokens(self, doc: str) -> set:
        """提取反引号内的 `域:动作` 形式 token。"""
        return set(re.findall(r"`([a-z]+:[a-z]+)`", doc))

    def test_documented_permissions_all_exist(self, doc_text, real_permissions):
        documented = self._permission_tokens(doc_text)
        assert documented, "文档中未提取到任何权限常量"
        phantom = sorted(documented - real_permissions)
        assert not phantom, "文档中的以下权限在 Permission 枚举中不存在:\n" + "\n".join(phantom)

    def test_all_real_permissions_documented(self, doc_text, real_permissions):
        documented = self._permission_tokens(doc_text)
        missing = sorted(p for p in real_permissions if p not in documented)
        assert not missing, "以下已实现的权限未在文档中:\n" + "\n".join(missing)

    def test_permission_count_claim(self, doc_text, real_permissions):
        m = re.search(r"共\s*(\d+)\s*项", doc_text)
        assert m, "文档未声明权限总数"
        claimed = int(m.group(1))
        assert claimed == len(real_permissions), (
            f"文档声称 {claimed} 项权限，实际 {len(real_permissions)} 项"
        )

    def test_red_line_list_matches(self, doc_text):
        from web.backend.collab.permissions import RED_LINE_PERMISSIONS

        for perm in sorted(RED_LINE_PERMISSIONS):
            assert perm in doc_text, f"红线权限未在文档中: {perm}"
        # 文档声称 3 项红线
        m = re.search(r"红线权限\*\*（(\d+) 项）", doc_text)
        assert m, "文档未声明红线权限数量"
        assert int(m.group(1)) == len(RED_LINE_PERMISSIONS)

    def test_role_matrix_matches_code(self, doc_text, real_permissions):
        """文档权限矩阵的 ✅/— 必须与 ROLE_PERMISSIONS 一致。"""
        from web.backend.collab.permissions import ROLE_PERMISSIONS

        lines = [l for l in doc_text.splitlines() if l.startswith("| `") and "✅" in l + "—"]
        assert lines, "未找到权限矩阵表格行"

        checked = 0
        for line in lines:
            cells = [c.strip() for c in line.split("|")]
            # cells: ['', perm, viewer, editor, owner, '']
            if len(cells) < 5 or not cells[1].startswith("`"):
                continue
            perm = cells[1].strip("`")
            if perm not in real_permissions:
                continue  # 非权限行（如表头）已在别处校验
            for role, cell in zip(("viewer", "editor", "owner"), cells[2:5]):
                has_doc = "✅" in cell
                has_code = perm in ROLE_PERMISSIONS.get(role, set())
                assert has_doc == has_code, (
                    f"权限矩阵不符: {perm} / {role} 文档标 {'有' if has_doc else '无'}，"
                    f"代码为 {'有' if has_code else '无'}"
                )
                checked += 1
        assert checked >= 30, f"权限矩阵校验覆盖不足，仅校验 {checked} 格"


class TestDocStructure:
    def test_no_placeholder_todos(self, doc_text):
        for bad in ("TODO", "TBD", "FIXME", "待补充"):
            assert bad not in doc_text, f"文档残留占位符: {bad}"

    def test_code_blocks_balanced(self, doc_text):
        assert doc_text.count("```") % 2 == 0, "代码块 ``` 未闭合"

    def test_no_trailing_whitespace_lines(self, doc_text):
        bad = [i + 1 for i, l in enumerate(doc_text.splitlines()) if l != l.rstrip()]
        assert not bad, f"以下行有行尾空格: {bad[:10]}"