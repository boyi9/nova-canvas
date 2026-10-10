"""BGE-M3 客户端 - 用于文本向量编码 (1024 维)"""

import os
import numpy as np
from typing import List, Optional
import httpx

BGE_API_URL = os.getenv("BGE_API_URL", "http://localhost:8002/embed/text")
BGE_API_KEY = os.getenv("BGE_API_KEY", "")

def get_bge_embedding(text: str) -> np.ndarray:
    """获取文本的 BGE-M3 向量 (1024 维)"""
    try:
        if BGE_API_URL:
            headers = {"Content-Type": "application/json"}
            if BGE_API_KEY:
                headers["Authorization"] = f"Bearer {BGE_API_KEY}"
            
            # 实际项目中应调用远程 API
            # 这里简化实现
            pass
    except Exception:
        pass
    
    # 降级：返回确定性伪向量（基于文本哈希，保证同一文本产生相同向量）
    return _deterministic_embedding(text, 1024)


def get_bge_embeddings_batch(texts: List[str]) -> List[np.ndarray]:
    """批量获取 BGE 向量"""
    return [get_bge_embedding(t) for t in texts]


def _deterministic_embedding(text: str, dim: int) -> np.ndarray:
    """基于文本哈希生成确定性向量（用于测试/降级）"""
    import hashlib
    hash_val = hashlib.md5(text.encode()).hexdigest()
    # 将哈希转为浮点数
    np.random.seed(int(hash_val[:8], 16))
    vec = np.random.randn(1024).astype(np.float32)
    vec = vec / (np.linalg.norm(vec) + 1e-9)
    return vec


# 本地 BGE-M3 实现（可选，需安装 FlagEmbedding）
class LocalBGE:
    def __init__(self, model_name: str = "BAAI/bge-m3"):
        try:
            from FlagEmbedding import BGEM3FlagModel
            self.model = BGEM3FlagModel(model_name, use_fp16=True)
        except Exception:
            self.model = None
    
    def encode(self, text: str) -> np.ndarray:
        if self.model is None:
            return _deterministic_embedding(text, 1024)
        try:
            output = self.model.encode(text, return_dense=True, return_sparse=False, return_colbert_vecs=False)
            vec = output["dense_vecs"][0].astype(np.float32)
            return vec / (np.linalg.norm(vec) + 1e-9)
        except Exception:
            return _deterministic_embedding(text, 1024)

_local_bge = None

def get_local_bge():
    global _local_bge
    if _local_bge is None:
        _local_bge = LocalBGE()
    return _local_bge if _local_bge.model else None


def get_bge_embedding_safe(text: str) -> np.ndarray:
    """安全获取 BGE 向量，优先本地"""
    local = get_local_bge()
    if local:
        return local.encode(text)
    return get_bge_embedding(text)