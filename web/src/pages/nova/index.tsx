// Nova启画 - 主页面组件
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, message } from "antd";
import { Plus, Sparkles } from "lucide-react";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";
import { SceneSelector } from "@/components/nova/scene-selector";
import { SceneWorkbench } from "@/components/nova/scene-workbench";

export function NovaHomePage() {
  const [activeScene, setActiveScene] = useState<SceneId>("ecommerce");
  const navigate = useNavigate();

  const handleCreateProject = (sceneId: SceneId) => {
    // 创建新项目并跳转到画布
    const projectId = `nova-${Date.now()}`;
    navigate(`/canvas/${projectId}?scene=${sceneId}`);
    message.success("正在创建新项目...");
  };

  const handleGenerate = (prompt: string, options: any) => {
    console.log("Generating:", { prompt, options });
    // TODO: 调用AI生成API
    message.info("AI生成功能开发中...");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Sparkles className="size-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-stone-900 dark:text-white">
              Nova启画
            </h1>
          </div>
          <p className="text-stone-600 dark:text-stone-400">
            一站式AI内容创作平台 · 电商素材 · 广告宣传片 · 轻情景剧
          </p>
        </div>

        {/* Scene Selector */}
        <div className="mb-8 flex justify-center">
          <SceneSelector
            activeScene={activeScene}
            onSceneChange={setActiveScene}
          />
        </div>

        {/* Scene Description */}
        <Card className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="m-0 text-xl font-medium">
                {NOVA_CONFIG.scenes[activeScene].name}
              </h2>
              <p className="mt-1 text-stone-500">
                {NOVA_CONFIG.scenes[activeScene].description}
              </p>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<Plus />}
              onClick={() => handleCreateProject(activeScene)}
            >
              创建新项目
            </Button>
          </div>
        </Card>

        {/* Workbench */}
        <SceneWorkbench scene={activeScene} onGenerate={handleGenerate} />

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              title: "AI智能生成",
              desc: "一键生成主图/详情图/短视频",
              icon: "✨",
            },
            {
              title: "模板复用",
              desc: "电商/广告/短剧模板一键套用",
              icon: "📋",
            },
            {
              title: "合规检测",
              desc: "广告法合规自动检测",
              icon: "✅",
            },
          ].map((feature) => (
            <Card key={feature.title} size="small" className="text-center">
              <div className="text-3xl">{feature.icon}</div>
              <h3 className="mt-2 mb-1 text-sm font-medium">{feature.title}</h3>
              <p className="m-0 text-xs text-stone-500">{feature.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default NovaHomePage;
