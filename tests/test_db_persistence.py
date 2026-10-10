# -*- coding: utf-8 -*-
# tests/test_db_persistence.py —— P0-2 SQLite 持久化底座与存储落盘验证
from __future__ import annotations

from pathlib import Path

import pytest

from web.backend.services.db import Database


@pytest.fixture()
def db_path(tmp_path) -> Path:
    p = tmp_path / "nova.db"
    yield p
    Database.reset()


class TestDatabaseBasics:
    def test_put_get_roundtrip(self, db_path):
        db = Database.instance(db_path)
        db.put("ns", "a", {"x": 1, "name": "中文"})
        assert db.get("ns", "a") == {"x": 1, "name": "中文"}

    def test_missing_returns_none(self, db_path):
        db = Database.instance(db_path)
        assert db.get("ns", "nope") is None

    def test_overwrite_upsert(self, db_path):
        db = Database.instance(db_path)
        db.put("ns", "a", {"v": 1})
        db.put("ns", "a", {"v": 2})
        assert db.get("ns", "a") == {"v": 2}
        assert len(db.list("ns")) == 1

    def test_delete_and_clear(self, db_path):
        db = Database.instance(db_path)
        db.put("ns", "a", {"v": 1})
        db.put("ns", "b", {"v": 2})
        assert db.delete("ns", "a") is True
        assert db.delete("ns", "a") is False
        db.clear("ns")
        assert db.list("ns") == []

    def test_namespace_isolation(self, db_path):
        db = Database.instance(db_path)
        db.put("ns1", "k", {"v": 1})
        db.put("ns2", "k", {"v": 2})
        assert db.get("ns1", "k") == {"v": 1}
        assert db.get("ns2", "k") == {"v": 2}


class TestPersistence:
    def test_survives_reopen(self, db_path):
        """核心验收：数据落盘后重新打开仍在（模拟进程重启）。"""
        db1 = Database.instance(db_path)
        db1.put("ns", "keep", {"v": 42})
        db1.close()
        Database.reset()

        db2 = Database.instance(db_path)
        assert db2.get("ns", "keep") == {"v": 42}

    def test_file_is_created(self, db_path):
        Database.instance(db_path).put("ns", "k", {"v": 1})
        assert db_path.exists()

    def test_event_append_and_read(self, db_path):
        db = Database.instance(db_path)
        db.append_event("ev", {"i": 1})
        db.append_event("ev", {"i": 2})
        events = db.read_events("ev")
        assert [e["i"] for e in events] == [1, 2]
        assert db.count_events("ev") == 2

    def test_event_newest_first(self, db_path):
        db = Database.instance(db_path)
        for i in range(3):
            db.append_event("ev", {"i": i})
        newest = db.read_events("ev", newest_first=True)
        assert [e["i"] for e in newest] == [2, 1, 0]

    def test_event_trim(self, db_path):
        db = Database.instance(db_path)
        for i in range(10):
            db.append_event("ev", {"i": i})
        db.trim_events("ev", 3)
        remaining = db.read_events("ev")
        assert [e["i"] for e in remaining] == [7, 8, 9]


class TestSingleton:
    def test_same_instance_returned(self, db_path):
        assert Database.instance(db_path) is Database.instance(db_path)

    def test_reset_rebuilds(self, db_path):
        first = Database.instance(db_path)
        Database.reset(db_path)
        second = Database.instance(db_path)
        assert first is not second