# -*- coding: utf-8 -*-
# file: backend/models/semantic_cache.py
# 作用：NC-CAP-05 网关语义缓存
# 相似度 >0.95 直接返回缓存结果；私有素材/实时/随机种子请求不落缓存
import time
import hashlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# 缓存命中/未命中打点
_CACHE_STATS = {"hits": 0, "misses": 0, "bypassed": 0}


def get_cache_stats() -> Dict[str, int]:
    return dict(_CACHE_STATS)


def reset_cache_stats() -> None:
    _CACHE_STATS["hits"] = 0
    _CACHE_STATS["misses"] = 0
    _CACHE_STATS["bypassed"] = 0


def hit_rate() -> float:
    total = _CACHE_STATS["hits"] + _CACHE_STATS["misses"]
    if total == 0:
        return 0.0
    return _CACHE_STATS["hits"] / total


@dataclass
class CacheKey:
    """缓存键：model_alias + prompt_version + 关键参数"""
    model_alias: str
    prompt_version: str
    prompt_body: str
    params: Dict[str, Any] = field(default_factory=dict)

    def to_hash(self) -> str:
        parts = [
            self.model_alias,
            self.prompt_version,
            self.prompt_body,
            str(sorted(self.params.items())),
        ]
        raw = "|".join(parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class CacheEntry:
    """缓存条目"""
    key_hash: str
    result: Any
    created_at: float
    access_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class SemanticCache:
    """
    语义缓存。
    - 精确键匹配：model_alias + prompt_version + prompt_body + params
    - 语义相似度匹配：对 prompt_body 做 n-gram Jaccard 相似度，>阈值则命中
    - 排除：private素材 / realtime / random_seed 请求
    """

    def __init__(
        self,
        max_entries: int = 1000,
        similarity_threshold: float = 0.95,
        ttl_s: float = 3600.0,
    ):
        self.max_entries = max_entries
        self.similarity_threshold = similarity_threshold
        self.ttl_s = ttl_s
        self._store: Dict[str, CacheEntry] = {}

    def should_bypass(
        self,
        is_private: bool = False,
        is_realtime: bool = False,
        has_random_seed: bool = False,
    ) -> bool:
        """判断是否跳过缓存"""
        if is_private or is_realtime or has_random_seed:
            _CACHE_STATS["bypassed"] += 1
            return True
        return False

    def get(self, key: CacheKey) -> Optional[Any]:
        """查询缓存：先精确匹配，再语义相似匹配"""
        key_hash = key.to_hash()

        # 1. 精确匹配
        if key_hash in self._store:
            entry = self._store[key_hash]
            if time.time() - entry.created_at < self.ttl_s:
                entry.access_count += 1
                _CACHE_STATS["hits"] += 1
                return entry.result
            else:
                del self._store[key_hash]

        # 2. 语义相似匹配（对 prompt_body 做 Jaccard）
        for stored_key, entry in self._store.items():
            if time.time() - entry.created_at >= self.ttl_s:
                continue
            if entry.metadata.get("model_alias") != key.model_alias:
                continue
            if entry.metadata.get("prompt_version") != key.prompt_version:
                continue
            sim = self._jaccard_similarity(
                key.prompt_body,
                entry.metadata.get("prompt_body", ""),
            )
            if sim > self.similarity_threshold:
                entry.access_count += 1
                _CACHE_STATS["hits"] += 1
                return entry.result

        _CACHE_STATS["misses"] += 1
        return None

    def put(
        self,
        key: CacheKey,
        result: Any,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """写入缓存"""
        key_hash = key.to_hash()
        meta = dict(metadata or {})
        meta["model_alias"] = key.model_alias
        meta["prompt_version"] = key.prompt_version
        meta["prompt_body"] = key.prompt_body

        self._store[key_hash] = CacheEntry(
            key_hash=key_hash,
            result=result,
            created_at=time.time(),
            metadata=meta,
        )
        # LRU 简化：超容量时删最旧
        if len(self._store) > self.max_entries:
            oldest_key = min(self._store, key=lambda k: self._store[k].created_at)
            del self._store[oldest_key]

    def invalidate(self, key: CacheKey) -> None:
        key_hash = key.to_hash()
        self._store.pop(key_hash, None)

    def clear(self) -> None:
        self._store.clear()

    def size(self) -> int:
        return len(self._store)

    @staticmethod
    def _jaccard_similarity(a: str, b: str) -> float:
        """字符 3-gram Jaccard 相似度"""
        if not a or not b:
            return 0.0
        if a == b:
            return 1.0
        grams_a = {a[i:i+3] for i in range(len(a) - 2)}
        grams_b = {b[i:i+3] for i in range(len(b) - 2)}
        if not grams_a or not grams_b:
            return 0.0
        intersection = grams_a & grams_b
        union = grams_a | grams_b
        return len(intersection) / len(union)


# 全局单例
_cache: Optional[SemanticCache] = None


def get_cache() -> SemanticCache:
    global _cache
    if _cache is None:
        _cache = SemanticCache()
    return _cache


def reset_cache() -> None:
    global _cache
    _cache = None
    reset_cache_stats()
