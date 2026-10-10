"""pytest 配置：添加项目路径到 sys.path。"""
import sys
from pathlib import Path

# 添加 web/backend 到 Python 路径
backend_path = Path(__file__).parent.parent / "web" / "backend"
sys.path.insert(0, str(backend_path))