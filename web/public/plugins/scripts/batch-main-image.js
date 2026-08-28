// 示例生图脚本：批量生成电商主图并加入画布。
// 运行于隔离 iframe，通过 window.hostBridge 调用宿主 AI 与画布能力。
(function () {
    var rpc = window.__PluginRuntime;
    var host = window.hostBridge;
    var PROMPT = "电商产品主图，纯白背景，专业打光，居中构图，高清细节";
    var COUNT = 4;

    function render(status, desc, image) {
        rpc.renderPanel({ title: "批量主图生成", description: desc, status: status, image: image || "" });
    }

    async function run() {
        render("loading", "正在生成 " + COUNT + " 张主图…");
        try {
            for (var i = 0; i < COUNT; i++) {
                var res = await host.ai.generateImage(PROMPT + "（变体 " + (i + 1) + "）", { count: 1 });
                var url = (res && res.images && res.images[0]) || "";
                await host.canvas.applyOps([
                    { type: "add_node", nodeType: "image", title: "主图 " + (i + 1), metadata: { content: url, status: "success" } },
                ]);
                if (i === 0) render("done", "已生成 " + COUNT + " 张主图并加入画布", url);
            }
            if (COUNT > 1) render("done", "已生成 " + COUNT + " 张主图并加入画布");
        } catch (e) {
            render("error", "生成失败：" + (e && e.message ? e.message : e));
        }
    }

    run();
})();
