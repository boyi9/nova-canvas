# -*- coding: utf-8 -*-
# file: backend/pro/pipeline_gateway.py
# 作用：把"AE / Nuke / Maya"三类作业统一为 PipelineJob，
#      并强制三条安全红线（发布 / 花钱 / 账号安全 永不自动）。
# 依赖：仅 Python 标准库
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional

__all__ = [
    "PipelineJob", "DCC", "Route", "REDLINE_ACTIONS", "AUTO_ACTIONS",
    "StartupCheckError", "assert_policy", "check_config", "DCC_CAPABILITY",
]


class StartupCheckError(RuntimeError):
    """启动检查失败异常。"""
    pass


class DCC(str, Enum):
    AE = "after_effects"
    NUKE = "nuke"
    MAYA = "maya"


class Route(str, Enum):
    HOST_SCRIPT = "host_script"   # 路线A：生成脚本 -> 宿主执行
    MCP_BRIDGE = "mcp_bridge"     # 路线B：MCP 直连
    HEADLESS_CLI = "headless_cli"  # 路线C：无头命令行渲染


# 允许自动执行的动作白名单（红线动作永不在此）
AUTO_ACTIONS = {
    "generate_script", "validate_script", "queue_render",
    "collect_render", "validate_exr", "build_version",
}
# 三条红线：任何情况下不得自动执行
REDLINE_ACTIONS = {"publish", "spend_money", "account_security", "final_approve"}

# 各 DCC 的推荐路线与工程文件格式事实（见 23.3 核查表）
DCC_CAPABILITY = {
    DCC.AE:   {"format": ".aep(二进制,不可直写)", "preferred_route": Route.HOST_SCRIPT,
               "script_ext": ".jsx", "cli": "aerender", "windows_only": True},
    DCC.NUKE: {"format": ".nk(纯文本,可直写)", "preferred_route": Route.HOST_SCRIPT,
               "script_ext": ".nk", "cli": "Nuke -x -F", "windows_only": False},
    DCC.MAYA: {"format": ".ma(ASCII,可直写)", "preferred_route": Route.HOST_SCRIPT,
               "script_ext": ".ma", "cli": "mayabatch -batch -render", "windows_only": False},
}


@dataclass
class PipelineJob:
    job_id: str
    dcc: DCC
    route: Route
    shot_id: str
    version: str = "v001"
    template: str = ""
    assets: Dict[str, str] = field(default_factory=dict)
    actions: List[str] = field(default_factory=list)
    license_ok: bool = False          # 授权合规声明（23.11 硬性准入）
    color_config: str = ""            # OCIO / ACES 配置声明

    def assert_policy(self) -> None:
        bad = REDLINE_ACTIONS.intersection(set(self.actions))
        if bad:
            raise PermissionError(f"红线动作禁止进入自动管线: {bad.pop() if len(bad) == 1 else sorted(bad)}")
        unknown = set(self.actions) - AUTO_ACTIONS
        if unknown:
            raise ValueError(f"未知动作，需先登记到 AUTO_ACTIONS: {sorted(unknown)}")
        if not self.license_ok:
            raise PermissionError("未声明合法软件授权，专业管线通道拒绝接入（见 23.11）")
        if not self.color_config:
            raise PermissionError("缺少色彩管理声明（OCIO/ACES），判定色彩不可信，阻断交付")

    def plan(self) -> Dict[str, str]:
        self.assert_policy()
        cap = DCC_CAPABILITY[self.dcc]
        return {
            "job_id": self.job_id,
            "dcc": self.dcc.value,
            "route": self.route.value,
            "engine_file": f"{self.shot_id}_{self.version}{cap['script_ext']}",
            "render_cli": cap["cli"],
            "windows_required": str(cap["windows_only"]),
            "format_note": cap["format"],
        }


if __name__ == "__main__":
    # 正常作业
    j = PipelineJob(job_id="J001", dcc=DCC.NUKE, route=Route.HOST_SCRIPT,
                    shot_id="sh010", template="basic_comp",
                    actions=["generate_script", "queue_render"],
                    license_ok=True, color_config="aces_2.0_studio")
    print("PLAN:", j.plan())

    # 红线动作 -> 必须抛错
    try:
        bad = PipelineJob(job_id="J002", dcc=DCC.AE, route=Route.HOST_SCRIPT,
                          shot_id="sh011", actions=["publish"],
                          license_ok=True, color_config="aces_2.0")
        bad.plan()
        print("ERROR: 红线未拦截")
    except PermissionError as e:
        print("REDLINE BLOCKED:", e)

    # 无授权 -> 必须抛错
    try:
        PipelineJob(job_id="J003", dcc=DCC.MAYA, route=Route.HOST_SCRIPT,
                    shot_id="sh012", actions=["generate_script"],
                    color_config="ocio_default").plan()
        print("ERROR: 授权未拦截")
    except PermissionError as e:
        print("LICENSE BLOCKED:", e)