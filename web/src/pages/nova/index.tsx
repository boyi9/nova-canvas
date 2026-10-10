// Nova启画 - 主页面组件
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, message } from "antd";
import { Plus, Sparkles, ClipboardList, CheckCircle } from "lucide-react";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";
import { SceneSelector } from "@/components/nova/scene-selector";
import { SceneWorkbench, type GenResult } from "@/components/nova/scene-workbench";
import { batchGenerateImages, chatCompletion, generateAdScript } from "@/services/nova/api";
import { buildGenResult } from "@/lib/nova/generate-result";

export function NovaHomePage() {
  const { t } = useTranslation();
  const [activeScene, setActiveScene] = useState<SceneId>("ecommerce");
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);

  const handleCreateProject = (sceneId: SceneId) => {
    // 创建新项目并跳转到画布
    const projectId = `nova-${Date.now()}`;
    navigate(`/canvas/${projectId}?scene=${sceneId}`);
    message.success(t("novaHome.creating"));
  };

  const handleGenerate = async (prompt: string, options: any) => {
    const scene = (options?.scene as SceneId) || activeScene;
    if (!prompt.trim()) {
      message.warning(t("novaHome.needTemplate"));
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      if (scene === "ecommerce") {
        const res = await batchGenerateImages({ prompt, count: 4, style: "white" });
        setResult(buildGenResult("ecommerce", res.images));
      } else if (scene === "advertising") {
        const res = await generateAdScript({ brief: prompt });
        setResult(buildGenResult("advertising", res));
      } else {
        const res = await chatCompletion([{ role: "user", content: prompt }], scene);
        setResult(buildGenResult(scene, res));
      }
      message.success(t("novaHome.generateDone"));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("novaHome.generateFail"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted dark:from-card dark:to-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Sparkles className="size-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-foreground dark:text-white">
              Nova启画
            </h1>
          </div>
          <p className="text-muted-foreground dark:text-muted-foreground">
            {t("novaHome.tagline")}
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
              <p className="mt-1 text-muted-foreground">
                {NOVA_CONFIG.scenes[activeScene].description}
              </p>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<Plus />}
              onClick={() => handleCreateProject(activeScene)}
            >
              {t("novaHome.createProject")}
            </Button>
          </div>
        </Card>

        {/* Workbench */}
        <SceneWorkbench scene={activeScene} onGenerate={handleGenerate} generating={generating} result={result} />

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["ai", "template", "compliance"] as const).map((key) => (
            <Card key={key} size="small" className="text-center">
              <div className="text-3xl">
                {key === "ai" ? (
                  <Sparkles className="size-8" />
                ) : key === "template" ? (
                  <ClipboardList className="size-8" />
                ) : (
                  <CheckCircle className="size-8" />
                )}
              </div>
              <h3 className="mt-2 mb-1 text-sm font-medium">{t(`novaHome.feature.${key}`)}</h3>
              <p className="m-0 text-xs text-muted-foreground">{t(`novaHome.feature.${key}Desc`)}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default NovaHomePage;
