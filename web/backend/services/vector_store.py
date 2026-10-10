"""Qdrant 向量存储服务 - 用于账号向量存储与 ANN 搜索"""

import os
from typing import List, Dict, Any, Optional
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.models import Distance, VectorParams

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "account_embeddings"
VECTOR_DIM = 1600  # 1024 (text) + 512 (visual) + 64 (behavior)

_client: QdrantClient = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
    return _client


def init_collection() -> bool:
    """初始化向量集合"""
    client = get_qdrant_client()
    collections = client.get_collections().collections
    names = [c.name for c in collections]
    
    if COLLECTION_NAME not in names:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=1600,
                distance=Distance.COSINE,
                hnsw_config={
                    "m": 16,
                    "ef_construct": 256
                }
            )
        )
        print(f"Created collection: {COLLECTION_NAME}")
    return True


def qdrant_upsert(vectors: List[Dict[str, Any]]) -> int:
    """批量写入向量
    vectors: [{"id": "platform:uid", "vector": [...], "payload": {...}}, ...]
    """
    client = get_qdrant_client()
    points = []
    for v in vectors:
        points.append(
            qdrant_models.PointStruct(
                id=v["id"],
                vector=v["vector"],
                payload=v["payload"]
            )
        )
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)


def qdrant_search(
    query_vector: List[float],
    limit: int = 10,
    filter_platform: str = None,
    filter_category: str = None,
    score_threshold: float = 0.0
) -> List[Dict]:
    """ANN 搜索"""
    client = get_qdrant_client()
    
    filter_conditions = []
    if filter_platform:
        filter_conditions.append(
            qdrant_models.FieldCondition(key="platform", match=qdrant_models.MatchValue(value=filter_platform))
        )
    if filter_category:
        filter_conditions.append(
            qdrant_models.FieldCondition(key="category", match=qdrant_models.MatchValue(value=filter_category))
        )
    
    query_filter = qdrant_models.Filter(must=filter_conditions) if filter_conditions else None
    
    results = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit,
        query_filter=query_filter,
        score_threshold=score_threshold,
        with_payload=True,
        with_vectors=False
    )
    
    return [
        {
            "id": hit.id,
            "score": hit.score,
            "payload": hit.payload,
            "vector": hit.vector if hasattr(hit, 'vector') and hit.vector else None
        }
        for hit in results
    ]


def qdrant_delete(ids: List[str]) -> int:
    """删除向量"""
    client = get_qdrant_client()
    client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=qdrant_models.PointIdsList(points=ids)
    )
    return len(ids)


def get_collection_info() -> Dict:
    """获取集合信息"""
    client = get_qdrant_client()
    info = client.get_collection(COLLECTION_NAME)
    return {
        "name": info.config.params.vectors.size,
        "vectors_count": info.vectors_count,
        "points_count": info.points_count,
        "status": info.status
    }


if __name__ == "__main__":
    # 测试
    init_collection()
    print("Collection info:", get_collection_info())
    
    # 测试写入
    test_vec = np.random.randn(1600).astype(np.float32)
    test_vec = test_vec / np.linalg.norm(test_vec)
    qdrant_upsert([{
        "id": "test:1",
        "vector": test_vec.tolist(),
        "payload": {"platform": "douyin", "category": "beauty", "nickname": "test_user"}
    }])
    
    # 测试搜索
    results = qdrant_search(test_vec.tolist(), limit=5)
    print(f"Search results: {len(results)}")
    for r in results:
        print(f"  {r['id']}: score={r['score']:.4f}, payload={r['payload']}")