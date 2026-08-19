// Nova启画 - 场景选择器组件
import { ShoppingCart, Video, Clapperboard } from "lucide-react";
import { Button, Tooltip } from "antd";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";

interface SceneSelectorProps {
  activeScene: SceneId;
  onSceneChange: (scene: SceneId) => void;
}

const SCENE_ICONS: Record<SceneId, React.ComponentType<{ className?: string }>> = {
  ecommerce: ShoppingCart,
  advertising: Video,
  drama: Clapperboard,
};

export function SceneSelector({ activeScene, onSceneChange }: SceneSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
      {(Object.keys(NOVA_CONFIG.scenes) as SceneId[]).map((sceneId) => {
        const scene = NOVA_CONFIG.scenes[sceneId];
        const Icon = SCENE_ICONS[sceneId];
        const isActive = activeScene === sceneId;

        return (
          <Tooltip key={sceneId} title={scene.description}>
            <Button
              type={isActive ? "primary" : "text"}
              icon={<Icon className="size-4" />}
              onClick={() => onSceneChange(sceneId)}
              className={`flex items-center gap-2 ${
                isActive
                  ? "!bg-blue-600 !text-white"
                  : "!text-stone-600 hover:!text-stone-950 dark:!text-stone-400 dark:hover:!text-white"
              }`}
            >
              <span className="hidden sm:inline">{scene.name}</span>
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default SceneSelector;
