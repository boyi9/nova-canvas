# -*- coding: utf-8 -*-
# file: backend/pro/pipeline_dag.py
# 作用：定义并校验组合管线依赖图（拓扑排序 + 环检测 + 缺失依赖检测）
# 依赖：仅 Python 标准库
from typing import Dict, List

PIPELINES: Dict[str, Dict[str, List[str]]] = {
    # 广告 / 宣传片 / 电商高端包装：AE 做创意与动效，Nuke 做最终合成与调色
    "ae_nuke": {
        "storyboard": [],
        "ae_packaging": ["storyboard"],
        "ae_export_exr": ["ae_packaging"],
        "nuke_comp": ["ae_export_exr"],          # 同时消费实拍/AI 生成画面（第13章）
        "nuke_grade": ["nuke_comp"],
        "delivery": ["nuke_grade"],
    },
    # 影视 / 游戏 / 短剧视效：Maya 出多通道 EXR，Nuke 做合成与镜头版本
    "maya_nuke": {
        "script_and_board": [],
        "maya_asset": ["script_and_board"],
        "maya_anim": ["maya_asset"],
        "maya_render_aov": ["maya_anim"],
        "nuke_relight": ["maya_render_aov"],
        "nuke_depth_comp": ["nuke_relight"],
        "nuke_selective_grade": ["nuke_depth_comp"],
        "shot_versions": ["nuke_selective_grade"],
        "delivery": ["shot_versions"],
    },
}


def topo_order(dag: Dict[str, List[str]]) -> List[str]:
    indeg = {n: 0 for n in dag}
    for n, deps in dag.items():
        for d in deps:
            if d not in dag:
                raise KeyError(f"节点 {n} 依赖了未定义节点 {d}")
            indeg[n] += 1
    ready = [n for n, v in indeg.items() if v == 0]
    out: List[str] = []
    while ready:
        n = ready.pop(0)
        out.append(n)
        for m, deps in dag.items():
            if n in deps:
                indeg[m] -= 1
                if indeg[m] == 0:
                    ready.append(m)
    if len(out) != len(dag):
        raise ValueError("依赖图存在环，无法拓扑排序")
    return out


def execute_pipeline(pipeline_name: str, context: Dict) -> List[str]:
    """执行管线，返回执行顺序。实际执行时需注入各阶段的执行器。"""
    dag = PIPELINES.get(pipeline_name)
    if not dag:
        raise ValueError(f"未知管线: {pipeline_name}")
    order = topo_order(dag)
    # 实际执行时，按顺序调用各阶段执行器
    # for stage in order:
    #     executor = STAGE_EXECUTORS[stage]
    #     executor.run(context)
    return order


if __name__ == "__main__":
    for name, dag in PIPELINES.items():
        order = topo_order(dag)
        print(f"[{name}] {len(order)} stages -> {order}")
        assert order[0] in ("storyboard", "script_and_board")
        assert order[-1] == "delivery"

    # 环检测必须生效
    try:
        topo_order({"a": ["b"], "b": ["a"]})
        print("ERROR: 未检测到环")
    except ValueError as e:
        print("CYCLE DETECTED:", e)

    # 缺失依赖必须生效
    try:
        topo_order({"a": ["ghost"]})
        print("ERROR: 未检测到缺失依赖")
    except KeyError as e:
        print("MISSING DEP DETECTED:", e)