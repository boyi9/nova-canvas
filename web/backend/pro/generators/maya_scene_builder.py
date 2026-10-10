# -*- coding: utf-8 -*-
# file: backend/pro/generators/maya_scene_builder.py
# 作用：生成 3D 场景/资产并支持无头批处理渲染。
# 依赖：仅 Python 标准库

# 版本适配层：Maya 版本碎片化适配
MAYA_VERSION_MATRIX = {
    "supported": ["2026", "2025"],
    "legacy_best_effort": ["2023", "2022", "2020", "2018"],
    "plugin_gate": {
        "mayausd": "2022+",
        "arnold": "bundled",
        "copycat": "2022+"  # CopyCat 在 2022+ 可用
    }
}


def probe_capability(version: str, feature: str) -> bool:
    """探测指定 Maya 版本是否支持某功能。"""
    if version in MAYA_VERSION_MATRIX["supported"]:
        return True
    if version in MAYA_VERSION_MATRIX["legacy_best_effort"]:
        # 旧版本尽力而为，不保证新特性
        if feature in ("generative_mesh", "motion_maker", "lookdevx"):
            return False
        return True
    return False


def build_maya_scene(shot: str, version: str, width: int, height: int,
                     maya_version: str = "2026",
                     use_ascii: bool = True) -> str:
    """
    生成 Maya 场景脚本（.ma ASCII 或 Python 脚本）。
    优先生成 .ma（ASCII 文本可直接写），逻辑复杂时切 .py。
    """
    if not probe_capability(maya_version, "basic"):
        raise ValueError(f"Maya {maya_version} 不在支持范围内")

    if use_ascii:
        return build_ma_ascii(shot, version)
    else:
        return build_py_script(shot, version, maya_version)


def build_ma_ascii(shot: str, version: str) -> str:
    """生成 .ma ASCII 场景文本（可直接写入 .ma 文件）。"""
    lines = [
        f"// Nova Canvas auto-generated Maya scene — {shot} {version}",
        "requires maya \"2022\";",
        "currentUnit -l centimeter -t film -a degree;",
        "",
        "// 相机：焦段/景深参数，与第 9 章编导层镜头语言对齐",
        "camera -n \"renderCam\" -centerOfInterest 10 -focalLength 35 "
        "-horizontalFilmAperture 1.417 -verticalFilmAperture 0.945 "
        "-nearClipPlane 0.1 -farClipPlane 10000;",
        "",
        "// 基础三点布光骨架",
        "directionalLight -n \"keyLight\" -intensity 1.5 -color 1 0.95 0.9;",
        "directionalLight -n \"fillLight\" -intensity 0.5 -color 0.9 0.95 1;",
        "directionalLight -n \"rimLight\" -intensity 0.8 -color 1 1 1;",
        "",
        "// 基础几何/道具占位",
        "polyCube -n \"prop_01\" -w 2 -h 2 -d 2;",
        "polySphere -n \"prop_02\" -r 1;",
        "",
        "// 材质占位（后续由 Nuke AOV 通道覆盖）",
        "shadingNode -asShader lambert -n \"mat_default\";",
        "",
        "// 渲染设置：Arnold AOV 多通道（见 NC-PRO-07）",
        "setAttr \"defaultRenderGlobals.imageFormat\" 51;  // EXR",
        "setAttr \"defaultArnoldDriver.exrCompression\" 1;  // ZIP",
        "setAttr \"defaultArnoldDriver.mergeAOVs\" 1;      // 多通道单文件",
        "",
        "// Arnold Driver 显式引用 (arnoldDriver)",
        "setAttr \"defaultArnoldDriver.ai_translator\" \"exr\";",
        "",
        f"// Shot: {shot} Version: {version}",
    ]
    return "\n".join(lines)


def build_py_script(shot: str, version: str, maya_version: str) -> str:
    """生成 Python 脚本（maya.cmds），适合复杂逻辑与循环。"""
    if not validate_maya_version(maya_version):
        raise ValueError(f"Maya {maya_version} 不在支持范围内")

    lines = [
        f"# Nova Canvas Maya Python script — {shot} {version}",
        "import maya.cmds as cmds",
        "",
        "# 相机",
        "cmds.camera(name='renderCam', focalLength=35, "
        "horizontalFilmAperture=1.417, verticalFilmAperture=0.945, "
        "nearClipPlane=0.1, farClipPlane=10000)",
        "",
        "# 三点布光",
        "cmds.directionalLight(name='keyLight', intensity=1.5, rgb=(1, 0.95, 0.9))",
        "cmds.directionalLight(name='fillLight', intensity=0.5, rgb=(0.9, 0.95, 1))",
        "cmds.directionalLight(name='rimLight', intensity=0.8, rgb=(1, 1, 1))",
        "",
        "# 基础几何/道具",
        "cmds.polyCube(name='prop_01', w=2, h=2, d=2)",
        "cmds.polySphere(name='prop_02', r=1)",
        "",
        "# 材质占位",
        "cmds.shadingNode('lambert', asShader=True, name='mat_default')",
        "",
        "# 渲染设置：Arnold AOV 多通道",
        'cmds.setAttr("defaultRenderGlobals.imageFormat", 51)',  # EXR
        'cmds.setAttr("defaultArnoldDriver.exrCompression", 1)',
        'cmds.setAttr("defaultArnoldDriver.mergeAOVs", 1)',
        "",
        "# Arnold Driver 显式引用 (arnoldDriver)",
        'cmds.setAttr("defaultArnoldDriver.ai_translator", "exr")',
        "",
        f"# Shot: {shot} Version: {version}",
    ]
    return "\n".join(lines)


def _check_version(version: str) -> bool:
    """检查 Maya 版本是否支持。"""
    return version in MAYA_VERSION_MATRIX["supported"] or \
           version in MAYA_VERSION_MATRIX["legacy_best_effort"]


def build_maya_render_cmd(ma_path: str, start: int, end: int,
                          renderer: str = "arnold") -> str:
    """构造 mayabatch 无头批渲染命令。"""
    if renderer not in ("arnold", "vray", "redshift"):
        raise ValueError(f"未适配渲染器: {renderer}")
    return f'mayabatch -batch -render -s {start} -e {end} "{ma_path}"'


def validate_maya_version(version: str) -> bool:
    """校验版本是否在支持范围。"""
    return version in MAYA_VERSION_MATRIX["supported"] or \
           version in MAYA_VERSION_MATRIX["legacy_best_effort"]


if __name__ == "__main__":
    # Demo: 生成 .ma 场景
    ma = build_ma_ascii("sh010", "v003")
    print("MA lines:", len(ma.splitlines()))
    assert "renderCam" in ma
    assert "arnoldDriver" in ma
    print("MA ASCII 生成成功")

    # Demo: Python 脚本
    py = build_py_script("sh010", "v003", "2026")
    assert "maya.cmds" in py
    print("Python 脚本生成成功")

    # 版本校验
    print("Maya 2026 supported:", validate_maya_version("2026"))
    print("Maya 2018 legacy:", validate_maya_version("2018"))
    try:
        build_maya_scene("sh010", "v001", 1920, 1080, "2015")
        print("ERROR: 未拦截不支持版本")
    except ValueError as e:
        print("VERSION CHECKED:", e)