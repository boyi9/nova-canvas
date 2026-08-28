// 端到端校验用回声脚本：不依赖 AI，仅验证脚本在隔离沙箱中运行并通过 applyOps 回写画布。
(function () {
    var rpc = window.__PluginRuntime;
    var host = window.hostBridge;
    rpc.renderPanel({ title: "Echo 脚本", description: "运行中", status: "loading" });
    host.canvas
        .applyOps([{ type: "add_node", nodeType: "text", title: "来自脚本", metadata: { content: "hello from script" } }])
        .then(function () {
            rpc.renderPanel({ title: "Echo 脚本", description: "已通过 applyOps 回写画布", status: "done" });
        })
        .catch(function (e) {
            rpc.renderPanel({ title: "Echo 脚本", description: "失败：" + (e && e.message ? e.message : e), status: "error" });
        });
})();
