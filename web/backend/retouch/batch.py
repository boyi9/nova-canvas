# -*- coding: utf-8 -*-
# file: backend/retouch/batch.py
# 作用：NC-RET-07 批量精修与配方化 —— 配方指纹 + 幂等 + 失败隔离 + 重试
from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional

# 幂等记录：idempotent_key -> 结果摘要（TTL 24h）
_idempotent_runs: Dict[str, Dict[str, Any]] = {}


def make_recipe(
    spec: Dict[str, Any],
    sample_asset_id: str,
    params_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """把一次成功修图的参数固化为可复用配方。"""
    return {
        "recipe_name": spec.get("label", spec.get("name", "未命名修图配方")),
        "target": spec["target"],
        "ops": list(spec["ops"]),
        "strength": spec.get("strength", 0.5),
        "params": params_override or {},
        "sample_asset_id": sample_asset_id,
        "schema_version": "1.0",
    }


def recipe_fingerprint(recipe: Dict[str, Any]) -> str:
    """配方指纹：参数微调即视为新配方，避免'偷偷改配方'导致结果不可复现。"""
    payload = json.dumps(
        {k: recipe[k] for k in ("target", "ops", "strength", "params")},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _purge_idempotent(now: Optional[float] = None) -> None:
    now = now or time.time()
    expired = [k for k, rec in _idempotent_runs.items() if now - rec["ts"] > 86400.0]
    for k in expired:
        del _idempotent_runs[k]


def run_batch(
    asset_ids: List[str],
    recipe: Dict[str, Any],
    worker: Callable[[str, Dict[str, Any]], Any],
    concurrency: int = 4,
    idempotent_key: Optional[str] = None,
    max_retry: int = 2,
) -> Dict[str, Any]:
    """批量精修：幂等 + 失败重试 + 单张失败不影响整批。"""
    assert recipe.get("schema_version"), "配方缺 schema_version，拒绝执行"

    _purge_idempotent()
    fingerprint = recipe_fingerprint(recipe)
    dedupe_key = idempotent_key or f"fp:{fingerprint}:count:{len(asset_ids)}"
    if dedupe_key in _idempotent_runs:
        prior = _idempotent_runs[dedupe_key]
        return {
            "ok": prior["ok"],
            "failed": prior["failed"],
            "total": prior["total"],
            "duplicate": True,
            "fingerprint": fingerprint,
        }

    done: List[Any] = []
    failed: List[Dict[str, Any]] = []

    def _run_one(aid: str) -> Any:
        last_err: Optional[Exception] = None
        for attempt in range(max_retry + 1):
            try:
                return worker(aid, recipe)
            except Exception as e:  # noqa: BLE001 —— 单张失败隔离
                last_err = e
        raise last_err  # type: ignore[misc]

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        futures = {ex.submit(_run_one, aid): aid for aid in asset_ids}
        for fut, aid in futures.items():
            try:
                done.append(fut.result())
            except Exception as e:  # noqa: BLE001
                failed.append({"asset_id": aid, "error": str(e)})

    result = {
        "ok": done,
        "failed": failed,
        "total": len(asset_ids),
        "duplicate": False,
        "fingerprint": fingerprint,
    }
    _idempotent_runs[dedupe_key] = {
        "ts": time.time(),
        "ok": done,
        "failed": failed,
        "total": len(asset_ids),
    }
    return result


def reset_batch_state() -> None:
    """测试用：清空幂等记录。"""
    _idempotent_runs.clear()
