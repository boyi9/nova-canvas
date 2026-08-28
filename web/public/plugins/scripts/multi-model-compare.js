// 示例生图脚本：用多个模型生成同一提示词，结果并排加入画布做对比。
(function () {
    var rpc = window.__PluginRuntime;
    var host = window.hostBridge;
    var PROMPT = "宁静的湖面，远山，晨雾，电影感，宽广构图";

    function render(status, desc, image) {
        rpc.renderPanel({ title: "多模型对比", description: desc, status: status, image: image || "" });
    }

    async function run() {
        render("loading", "用不同模型生成同一提示词…");
        try {
            var models = host.ai.listModels("image") || [];
            var chosen = models.slice(0, 2).map(function (m) { return m.value; });
            if (chosen.length === 0) chosen = [host.ai.defaultModel("image")];

            var urls = [];
            for (var i = 0; i < chosen.length; i++) {
                var res = await host.ai.generateImage(PROMPT, { model: chosen[i], count: 1 });
                var url = (res && res.images && res.images[0]) || "";
                urls.push(url);
                await host.canvas.applyOps([
                    { type: "add_node", nodeType: "image", title: "模型: " + chosen[i], metadata: { content: url, status: "success" } },
                ]);
            }
            render("done", "已用 " + chosen.length + " 个模型生成并对比", urls[0]);
        } catch (e) {
            render("error", "对比失败：" + (e && e.message ? e.message : e));
        }
    }

    run();
})();
