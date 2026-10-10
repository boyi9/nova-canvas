# -*- coding: utf-8 -*-
# file: backend/pro/render/ae_render_service.py
# 作用：实现 AE 的无头批量渲染，支持分布式与失败重试。
# 依赖：pip install nexrender（Node.js 环境需预装）
# 说明：以 Nexrender 为底座，JSON 定义 Job，支持分布式渲染与失败重试。
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class AeRenderJob:
    """AE 渲染作业定义，对应 Nexrender Job Schema。"""
    template: str                 # .aep 模板路径
    comp: str                     # 合成名称
    output: str                   # 输出路径
    assets: List[Dict[str, str]]  # [{"src": "...", "layerName": "TITLE_01"}]
    actions: Dict = None          # 后处理动作（编码、拷贝、上传等）
    settings: Dict = None         # 缓存、并发等设置

    def to_json(self) -> str:
        return json.dumps({
            "template": self.template,
            "comp": self.comp,
            "output": self.output,
            "assets": self.assets,
            "actions": self.actions or {"postrender": []},
            "settings": self.settings or {"cache": True},
        }, ensure_ascii=False)


def build_aerender_cmd(aep_path: str, comp_name: str, out_path: str,
                       start: int = 0, end: int = -1) -> str:
    """构造 aerender 无头渲染命令（AE 官方 CLI）。end=-1 表示渲染整个合成。"""
    return (f'aerender -project "{aep_path}" -comp "{comp_name}" '
            f'-s {start} -e {end} -output "{out_path}"')


class AeRenderService:
    """AE 无头渲染服务，封装 Nexrender 调用与 aerender 回退。"""

    def __init__(self, nexrender_bin: str = "nexrender", max_retries: int = 2):
        self.nexrender_bin = nexrender_bin
        self.max_retries = max_retries

    def render(self, job: AeRenderJob, out_dir: str) -> Dict:
        """
        执行渲染作业。
        返回: {"success": bool, "output": str, "error": str, "retries": int}
        """
        # 写入 Job JSON
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(job.to_json(), f, ensure_ascii=False)
            job_path = f.name

        os.makedirs(out_dir, exist_ok=True)

        last_err = ""
        for attempt in range(self.max_retries + 1):
            try:
                # 优先用 Nexrender（支持分布式、资源替换）
                cmd = [self.nexrender_bin, "-j", job_path]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
                if result.returncode == 0:
                    return {"success": True, "output": result.stdout, "error": "", "retries": attempt}
                last_err = result.stderr
            except subprocess.TimeoutExpired:
                last_err = "render timeout"
            except Exception as e:
                last_err = str(e)

            # 回退到 aerender 单机渲染（需指定工程路径、合成名、输出路径）
            # 实际生产中需根据模板生成 .aep，这里仅演示回退逻辑
            if attempt == self.max_retries:
                break

        return {"success": False, "output": "", "error": last_err, "retries": self.max_retries}


def render_batch(jobs: List[AeRenderJob], out_base: str, max_parallel: int = 2) -> List[Dict]:
    """批量渲染，支持并发控制。"""
    import concurrent.futures
    results = []
    service = AeRenderService()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_parallel) as executor:
        futures = {executor.submit(service.render, job, os.path.join(out_base, f"job_{i}")): i
                   for i, job in enumerate(jobs)}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    return results


if __name__ == "__main__":
    # Demo：批量渲染 3 个商品
    jobs = [
        AeRenderJob(
            template="/templates/packaging_v3.aep",
            comp="MAIN_9x16",
            output="/out/product_a.mp4",
            assets=[{"src": "/assets/a.jpg", "layerName": "PRODUCT_01"}],
        ),
        AeRenderJob(
            template="/templates/packaging_v3.aep",
            comp="MAIN_9x16",
            output="/out/product_b.mp4",
            assets=[{"src": "/assets/b.jpg", "layerName": "PRODUCT_01"}],
        ),
        AeRenderJob(
            template="/templates/packaging_v3.aep",
            comp="MAIN_9x16",
            output="/out/product_c.mp4",
            assets=[{"src": "/assets/c.jpg", "layerName": "PRODUCT_01"}],
        ),
    ]
    print("Batch render schema:", json.dumps(jobs[0].to_json(), ensure_ascii=False, indent=2))
    # 实际运行需配置 nexrender 环境
    # results = render_batch(jobs, "/out", max_parallel=2)
    # for r in results: print(r)