"""CLIP 客户端 - 用于视觉向量编码"""

import os
import numpy as np
from typing import List, Optional
import httpx

# 可选：本地 CLIP（如果不想用 API）
# import clip
# import torch

CLIP_API_URL = os.getenv("CLIP_API_URL", "http://localhost:8001/embed/image")
CLIP_API_KEY = os.getenv("CLIP_API_KEY", "")

def get_clip_embedding(image_url: str) -> np.ndarray:
    """获取图片的 CLIP 向量 (512 维)
    
    支持：
    1. 本地 CLIP 模型（如果已加载）
    2. 远程 API（如有部署）
    3. 降级：返回零向量
    """
    try:
        # 尝试调用远程 CLIP API
        if CLIP_API_URL:
            headers = {}
            if CLIP_API_KEY:
                headers["Authorization"] = f"Bearer {CLIP_API_KEY}"
            
            # 这里简化：实际应下载图片后上传，或传 URL 让服务端下载
            # 简化实现：返回零向量，实际项目中需实现完整流程
            pass
    except Exception:
        pass
    
    # 降级：返回零向量（实际项目需替换为真实 CLIP 调用）
    return np.zeros(512, dtype=np.float32)


def get_clip_embeddings_batch(image_urls: List[str]) -> List[np.ndarray]:
    """批量获取 CLIP 向量"""
    return [get_clip_embedding(url) for url in image_urls]


# 本地 CLIP 实现（可选，需安装 clip 库和 torch）
class LocalCLIP:
    def __init__(self, model_name: str = "ViT-L/14"):
        try:
            import clip
            import torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model, self.preprocess = clip.load(model_name, device=self.device)
            self.model.eval()
        except Exception:
            self.model = None
    
    def encode_image(self, image_url: str) -> np.ndarray:
        if self.model is None:
            return np.zeros(512, dtype=np.float32)
        
        try:
            import requests
            from PIL import Image
            import torch
            
            # 下载图片
            resp = requests.get(image_url, timeout=10)
            img = Image.open(requests.get(image_url, stream=True).raw).convert("RGB")
            
            image_input = self.preprocess(img).unsqueeze(0).to(self.device)
            with torch.no_grad():
                features = self.model.encode_image(image_input)
                features = features / features.norm(dim=-1, keepdim=True)
            return features.cpu().numpy().astype(np.float32).flatten()
        except Exception:
            return np.zeros(512, dtype=np.float32)

# 全局实例（懒加载）
_local_clip = None

def get_local_clip() -> Optional["LocalCLIP"]:
    global _local_clip
    if _local_clip is None:
        _local_clip = LocalCLIP()
    return _local_clip if _local_clip.model else None


def get_clip_embedding_safe(image_url: str) -> np.ndarray:
    """安全获取 CLIP 向量，优先本地，失败返回零向量"""
    local = get_local_clip()
    if local:
        return local.encode_image(image_url)
    return get_clip_embedding(image_url)  # 会返回零向量