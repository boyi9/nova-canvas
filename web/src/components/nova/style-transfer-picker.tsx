// Nova启画 - 风格迁移选择器组件
import { useState } from "react";
import { Alert, Button, Card, Empty, Input, Radio, Slider, Spin, message } from "antd";
import { ExternalLink, Film, Image as ImageIcon, Sparkles } from "lucide-react";
import {
  IMAGE_STYLE_TEMPLATES,
  VIDEO_STYLE_TEMPLATES,
  transferImageStyle,
  transferVideoStyle,
  type StyleTransferConfig,
} from "@/templates/style-transfer";

interface StyleTransferPickerProps {
  onSelect?: (config: StyleTransferConfig, resultUrl?: string) => void;
}

export function StyleTransferPicker({ onSelect }: StyleTransferPickerProps) {
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<StyleTransferConfig | null>(null);
  const [strength, setStrength] = useState(0.7);
  const [fidelity, setFidelity] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templates = mediaType === "image" ? IMAGE_STYLE_TEMPLATES : VIDEO_STYLE_TEMPLATES;

  const resetResult = () => {
    setResultUrl(null);
    setError(null);
  };

  const handleApply = async () => {
    if (!sourceUrl.trim()) {
      message.warning("请先粘贴需要迁移的图片/视频 URL");
      return;
    }
    if (!selectedStyle) {
      message.warning("请先选择风格");
      return;
    }

    const config: StyleTransferConfig = {
      ...selectedStyle,
      parameters: { ...selectedStyle.parameters, strength, fidelity },
    };

    resetResult();
    setLoading(true);
    try {
      const res =
        mediaType === "image"
          ? await transferImageStyle(sourceUrl.trim(), config)
          : await transferVideoStyle(sourceUrl.trim(), config);
      if (res.success && res.resultUrl) {
        setResultUrl(res.resultUrl);
        onSelect?.(config, res.resultUrl);
        message.success("风格迁移完成");
      } else {
        setError(res.error || "风格迁移失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "风格迁移失败");
    } finally {
      setLoading(false);
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
            resetResult();
          }}
        >
          <Radio.Button value="image">
            <ImageIcon className="mr-1 inline size-4" />
            图片
          </Radio.Button>
          <Radio.Button value="video">
            <Film className="mr-1 inline size-4" />
            视频
          </Radio.Button>
        </Radio.Group>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          源{mediaType === "image" ? "图片" : "视频"} URL
        </label>
        <Input
          placeholder="粘贴公网可访问的图片/视频地址（风格迁移后端需能抓取该 URL）"
          value={sourceUrl}
          onChange={(e) => {
            setSourceUrl(e.target.value);
            resetResult();
          }}
        />
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
                onClick={() => {
                  setSelectedStyle(template);
                  resetResult();
                }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <span className="text-sm font-medium">{template.name}</span>
                </div>
                <p className="m-0 mt-1 text-xs text-stone-500">{template.description}</p>
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

          <Button type="primary" block onClick={handleApply} loading={loading}>
            应用风格
          </Button>
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Spin tip="风格迁移中（后端异步生成）" />
        </div>
      )}

      {error && <Alert type="error" showIcon message="风格迁移失败" description={error} />}

      {resultUrl && (
        <Card size="small" title="迁移结果" extra={
          <a href={resultUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
            <ExternalLink className="size-3.5" /> 打开/下载
          </a>
        }>
          {mediaType === "image" ? (
            <img src={resultUrl} alt="风格迁移结果" className="max-h-72 w-full rounded border border-stone-200 object-contain dark:border-stone-700" />
          ) : (
            <video src={resultUrl} controls className="max-h-72 w-full rounded border border-stone-200 dark:border-stone-700" />
          )}
        </Card>
      )}
    </div>
  );
}

export default StyleTransferPicker;
