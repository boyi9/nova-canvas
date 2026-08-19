// Nova启画 - 风格迁移选择器组件
import { useState } from "react";
import { Button, Card, Empty, Radio, Space, Slider, Tag } from "antd";
import { Image, Film, Sparkles } from "lucide-react";
import {
  IMAGE_STYLE_TEMPLATES,
  VIDEO_STYLE_TEMPLATES,
  type StyleTransferConfig,
} from "@/templates/style-transfer";

interface StyleTransferPickerProps {
  onSelect: (config: StyleTransferConfig) => void;
}

export function StyleTransferPicker({ onSelect }: StyleTransferPickerProps) {
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [selectedStyle, setSelectedStyle] = useState<StyleTransferConfig | null>(null);
  const [strength, setStrength] = useState(0.7);
  const [fidelity, setFidelity] = useState(0.8);

  const templates = mediaType === "image" ? IMAGE_STYLE_TEMPLATES : VIDEO_STYLE_TEMPLATES;

  const handleSelect = () => {
    if (selectedStyle) {
      onSelect({
        ...selectedStyle,
        parameters: {
          ...selectedStyle.parameters,
          strength,
          fidelity,
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm font-medium">媒体类型</label>
        <Radio.Group
          value={mediaType}
          onChange={(e) => {
            setMediaType(e.target.value);
            setSelectedStyle(null);
          }}
        >
          <Radio.Button value="image">
            <Image className="mr-1 inline size-4" />
            图片
          </Radio.Button>
          <Radio.Button value="video">
            <Film className="mr-1 inline size-4" />
            视频
          </Radio.Button>
        </Radio.Group>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">选择风格</label>
        {templates.length === 0 ? (
          <Empty description="暂无模板" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((template) => (
              <Card
                key={template.id}
                size="small"
                hoverable
                className={`cursor-pointer ${
                  selectedStyle?.id === template.id
                    ? "!border-blue-500 !bg-blue-50 dark:!bg-blue-900/20"
                    : ""
                }`}
                onClick={() => setSelectedStyle(template)}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <span className="text-sm font-medium">{template.name}</span>
                </div>
                <p className="m-0 mt-1 text-xs text-stone-500">
                  {template.description}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedStyle && (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium">
              风格强度: {Math.round(strength * 100)}%
            </label>
            <Slider
              min={0}
              max={100}
              value={strength * 100}
              onChange={(v) => setStrength(v / 100)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              内容保真度: {Math.round(fidelity * 100)}%
            </label>
            <Slider
              min={0}
              max={100}
              value={fidelity * 100}
              onChange={(v) => setFidelity(v / 100)}
            />
          </div>

          <Card size="small" className="!bg-stone-50 dark:!bg-stone-800">
            <p className="m-0 text-xs text-stone-500">
              <strong>提示词：</strong>
              {selectedStyle.prompt.replace(/\{content\}/g, "[您的内容]")}
            </p>
          </Card>

          <Button type="primary" block onClick={handleSelect}>
            应用风格
          </Button>
        </>
      )}
    </div>
  );
}

export default StyleTransferPicker;
