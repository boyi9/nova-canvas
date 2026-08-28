// 示例生图脚本：以画布上第一张图片节点为参考图，做图生图编辑并写回原节点。
(function () {
    var rpc = window.__PluginRuntime;
    var host = window.hostBridge;

    function render(status, desc, image) {
        rpc.renderPanel({ title: "参考图编辑", description: desc, status: status, image: image || "" });
    }

    function firstImage(nodes) {
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.type === "image" && n.metadata) {
                var content = n.metadata.content || (n.metadata.images && n.metadata.images[0] && n.metadata.images[0].content);
                if (content) return { id: n.id, content: content };
            }
        }
        return null;
    }

    async function run() {
        render("loading", "读取画布图片节点…");
        try {
            var nodes = await host.canvas.getNodes();
            var target = firstImage(nodes);
            if (!target) {
                render("error", "画布上没有可编辑的图片节点（请先放一张图片）");
                return;
            }
            render("loading", "基于参考图重新生成…");
            var res = await host.ai.generateImage("保持主体与构图，换一种艺术风格与配色", { references: [target.content], count: 1 });
            var url = (res && res.images && res.images[0]) || "";
            await host.canvas.updateMetadata(target.id, { content: url, status: "success" });
            render("done", "已基于参考图编辑并写回原节点", url);
        } catch (e) {
            render("error", "编辑失败：" + (e && e.message ? e.message : e));
        }
    }

    run();
})();
