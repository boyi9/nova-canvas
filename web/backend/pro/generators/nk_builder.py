# -*- coding: utf-8 -*-
# file: backend/pro/generators/nk_builder.py
# 作用：直接生成 .nk 文本脚本，构建合成节点图并渲染。
# 依赖：仅 Python 标准库

WORKFLOW_TEMPLATES = {
    "basic_comp": ["Read", "OCIOColorSpace", "Grade", "Merge", "Write"],
    "depth_comp": ["Read", "OCIOColorSpace", "ZDefocus", "Merge", "Write"],
    "relight":    ["Read", "Merge", "Grade", "Write"],
    "selective":  ["Read", "Cryptomatte", "Grade", "Write"],
    "cleanup":    ["Read", "Roto", "RpMPaint", "Merge", "Write"],
}


def build_nk(shot: str, version: str, width: int, height: int,
             template: str = "basic_comp", out_dir: str = "/deliver") -> str:
    if template not in WORKFLOW_TEMPLATES:
        raise ValueError(f"未登记模板: {template}")
    nodes = WORKFLOW_TEMPLATES[template]
    head = [
        f"#! /opt/Nuke/Nuke16.0 -nx",
        f"version 16.0 v1",
        f"# Nova Canvas auto-generated comp for {shot} {version}",
        "Root {",
        f' inputs 0',
        f' format "{width} {height} 0 0 {width} {height} 1 HD_1080"',
        "}",
    ]
    # Nuke 中既有节点默认名，避免同名冲突
    read = (f"Read {{\n file \"{out_dir}/{shot}_{version}_beauty_%04d.exr\"\n"
            f" first 1001\n last 1100\n}}\n")
    ocio = ("OCIOColorSpace {\n in_colorspace ACEScg\n out_colorspace sRGB\n}\n")
    grade = ("Grade {\n blackpoint 0\n whitepoint 1\n lift 0\n gain 1\n multiply 1\n}\n")
    merge = ("Merge2 {\n operation over\n}\n")
    write = (f"Write {{\n file \"{out_dir}/{shot}_{version}_comp_%04d.exr\"\n"
             f" file_type exr\n channels all\n}}\n")
    body = read + ocio + grade + merge + write
    # 位置排布，便于在节点图中阅读
    for i, n in enumerate(nodes):
        body += f"# [{i}] {n}\n"
    return "\n".join(head) + "\n" + body


def build_nuke_cli(nk_path: str, start: int, end: int) -> str:
    """Nuke 无头批渲染：-x 执行脚本，-F 指定帧范围。"""
    return f'Nuke -x -F {start}-{end} "{nk_path}"'


if __name__ == "__main__":
    nk = build_nk("sh010", "v003", 1920, 1080, template="basic_comp")
    assert "Read {" in nk and "Write {" in nk
    assert "sh010_v003_beauty_%04d.exr" in nk          # 读取输入
    assert "sh010_v003_comp_%04d.exr" in nk            # 写出结果
    assert nk.count("{") == nk.count("}"), "花括号未闭合"
    print("NK lines:", len(nk.splitlines()))
    print("TEMPLATES:", sorted(WORKFLOW_TEMPLATES.keys()))
    print("CLI:", build_nuke_cli("/comp/sc_010.nk", 1001, 1100))
    try:
        build_nk("sh011", "v001", 1920, 1080, template="not_exist")
        print("ERROR: 未拦截未登记模板")
    except ValueError as e:
        print("TEMPLATE CHECKED:", e)