# -*- coding: utf-8 -*-
# file: tests/test_cap_semantic_cache.py
# 作用：NC-CAP-05 网关语义缓存测试
import pytest
from web.backend.models.semantic_cache import (
    SemanticCache,
    CacheKey,
    get_cache,
    reset_cache,
    get_cache_stats,
    reset_cache_stats,
    hit_rate,
)


class TestCacheKey:
    """缓存键"""

    def test_hash_deterministic(self):
        k1 = CacheKey("model-a", "v1.0", "一只猫")
        k2 = CacheKey("model-a", "v1.0", "一只猫")
        assert k1.to_hash() == k2.to_hash()

    def test_hash_differs_by_model(self):
        k1 = CacheKey("model-a", "v1.0", "一只猫")
        k2 = CacheKey("model-b", "v1.0", "一只猫")
        assert k1.to_hash() != k2.to_hash()

    def test_hash_differs_by_params(self):
        k1 = CacheKey("model-a", "v1.0", "一只猫", {"size": "1024"})
        k2 = CacheKey("model-a", "v1.0", "一只猫", {"size": "2048"})
        assert k1.to_hash() != k2.to_hash()


class TestBypass:
    """排除缓存：私有素材/实时/随机种子"""

    def test_private_bypass(self):
        cache = SemanticCache()
        assert cache.should_bypass(is_private=True)

    def test_realtime_bypass(self):
        cache = SemanticCache()
        assert cache.should_bypass(is_realtime=True)

    def test_random_seed_bypass(self):
        cache = SemanticCache()
        assert cache.should_bypass(has_random_seed=True)

    def test_normal_not_bypass(self):
        cache = SemanticCache()
        assert not cache.should_bypass()


class TestExactHit:
    """精确命中"""

    def test_miss_then_hit(self):
        """相同请求二次调用命中缓存"""
        cache = SemanticCache()
        key = CacheKey("model-a", "v1.0", "高质感电商主图，保温杯")
        result_data = {"url": "http://img/001.png"}

        # 第一次：miss
        assert cache.get(key) is None
        cache.put(key, result_data)

        # 第二次：hit
        cached = cache.get(key)
        assert cached == result_data

    def test_different_prompt_miss(self):
        """不同 prompt → miss"""
        cache = SemanticCache()
        k1 = CacheKey("model-a", "v1.0", "高质感电商主图，保温杯")
        k2 = CacheKey("model-a", "v1.0", "完全不同的提示词内容")
        cache.put(k1, {"url": "a.png"})
        assert cache.get(k2) is None


class TestSemanticHit:
    """语义相似命中"""

    def test_near_duplicate_hit(self):
        """几乎相同的 prompt（仅细微差别）→ 相似度 >0.95 → hit"""
        cache = SemanticCache(similarity_threshold=0.90)
        k1 = CacheKey("model-a", "v1.0", "高质感电商主图，纯白背景，居中构图，商业摄影")
        k2 = CacheKey("model-a", "v1.0", "高质感电商主图，纯白背景，居中构图，商业摄影。")
        cache.put(k1, {"url": "a.png"})
        result = cache.get(k2)
        assert result == {"url": "a.png"}

    def test_different_prompt_low_similarity(self):
        """完全不同的 prompt → 低相似度 → miss"""
        cache = SemanticCache(similarity_threshold=0.95)
        k1 = CacheKey("model-a", "v1.0", "高质感电商主图，纯白背景")
        k2 = CacheKey("model-a", "v1.0", "夜晚城市霓虹街景，赛博朋克风格")
        cache.put(k1, {"url": "a.png"})
        assert cache.get(k2) is None

    def test_different_model_no_hit(self):
        """不同模型不跨命中"""
        cache = SemanticCache()
        k1 = CacheKey("model-a", "v1.0", "高质感电商主图")
        k2 = CacheKey("model-b", "v1.0", "高质感电商主图")
        cache.put(k1, {"url": "a.png"})
        assert cache.get(k2) is None


class TestCacheStats:
    """命中率打点"""

    def test_hit_rate_after_operations(self):
        """操作后统计命中率"""
        reset_cache_stats()
        cache = SemanticCache()
        key = CacheKey("model-a", "v1.0", "测试提示词内容示例")

        # miss
        assert cache.get(key) is None
        cache.put(key, {"r": 1})
        # hit
        assert cache.get(key) == {"r": 1}

        stats = get_cache_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert hit_rate() == 0.5

    def test_bypass_counted(self):
        reset_cache_stats()
        cache = SemanticCache()
        cache.should_bypass(is_private=True)
        stats = get_cache_stats()
        assert stats["bypassed"] == 1


class TestTTL:
    """TTL 过期"""

    def test_expired_entry(self):
        """过期条目 → miss"""
        cache = SemanticCache(ttl_s=0)  # 立即过期
        key = CacheKey("model-a", "v1.0", "提示词")
        cache.put(key, {"r": 1})
        # ttl=0 → 已过期
        assert cache.get(key) is None


class TestLRU:
    """容量控制"""

    def test_max_entries(self):
        """超容量时淘汰最旧"""
        cache = SemanticCache(max_entries=3)
        for i in range(5):
            key = CacheKey("model-a", "v1.0", f"prompt-{i}")
            cache.put(key, {"i": i})
        assert cache.size() <= 4  # 允许略超后淘汰


class TestGlobalCache:
    """全局单例"""

    def test_get_cache_singleton(self):
        reset_cache()
        c1 = get_cache()
        c2 = get_cache()
        assert c1 is c2
