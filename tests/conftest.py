# -*- coding: utf-8 -*-
# file: tests/conftest.py
# 作用：测试会话级隔离 —— 所有 SQLite 持久化测试使用临时库，不污染真实数据目录
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


@pytest.fixture(scope="session", autouse=True)
def _isolated_database(tmp_path_factory):
    """把 NOVA_DB_PATH 指向会话临时目录，测试结束后自动清理。"""
    from web.backend.services.db import Database

    tmp_dir = tmp_path_factory.mktemp("nova-db")
    db_file = tmp_dir / "test.db"
    import os

    os.environ["NOVA_DB_PATH"] = str(db_file)
    Database.reset()
    yield db_file
    Database.reset()