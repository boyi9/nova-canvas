# -*- coding: utf-8 -*-
# file: tests/test_retouch_batch.py
# 作用：NC-RET-07 批量配方 —— 指纹 / 幂等 / 失败隔离 / 重试
import pytest

from web.backend.retouch.batch import (
    make_recipe,
    recipe_fingerprint,
    reset_batch_state,
    run_batch,
)


@pytest.fixture(autouse=True)
def _clean():
    reset_batch_state()
    yield
    reset_batch_state()


def _recipe(ops=("skin_smooth",), strength=0.5):
    return make_recipe({"target": "portrait", "ops": list(ops), "strength": strength}, "sample-1")


def test_recipe_shape():
    r = _recipe()
    assert r["schema_version"] == "1.0"
    assert r["sample_asset_id"] == "sample-1"
    assert r["target"] == "portrait"


def test_fingerprint_stable_and_sensitive():
    r1 = _recipe()
    r2 = _recipe()
    assert recipe_fingerprint(r1) == recipe_fingerprint(r2)
    r3 = _recipe(strength=0.8)
    assert recipe_fingerprint(r1) != recipe_fingerprint(r3)


def test_batch_success_and_isolation():
    calls = []

    def worker(asset_id, recipe):
        calls.append(asset_id)
        if asset_id == "bad-1":
            raise RuntimeError("boom")
        return {"asset_id": asset_id, "status": "ok"}

    result = run_batch(["a1", "bad-1", "a3"], _recipe(), worker, concurrency=2, max_retry=0)
    assert result["total"] == 3
    assert len(result["ok"]) == 2
    assert len(result["failed"]) == 1
    assert result["failed"][0]["asset_id"] == "bad-1"
    assert result["duplicate"] is False


def test_batch_retry_recovers():
    attempts = {"n": 0}

    def worker(asset_id, recipe):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise RuntimeError("flaky")
        return {"asset_id": asset_id, "status": "ok"}

    result = run_batch(["only"], _recipe(), worker, concurrency=1, max_retry=2)
    assert len(result["ok"]) == 1
    assert result["failed"] == []


def test_batch_idempotent_duplicate():
    def worker(asset_id, recipe):
        return {"asset_id": asset_id, "status": "ok"}

    first = run_batch(["a1"], _recipe(), worker, idempotent_key="run-1")
    second = run_batch(["a1"], _recipe(), worker, idempotent_key="run-1")
    assert first["duplicate"] is False
    assert second["duplicate"] is True


def test_batch_requires_schema():
    with pytest.raises(AssertionError):
        run_batch(["a1"], {"target": "portrait", "ops": []}, lambda a, r: a)
