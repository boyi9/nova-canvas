// Nova启画 - 模板选择器组件
import { Button, Card, Empty, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";
import {
  getTemplatesByPlatform,
  type EcommerceTemplate,
} from "@/templates/ecommerce/main-image-templates";
import {
  getTemplatesByCategory as getAdTemplates,
  type AdvertisingTemplate,
} from "@/templates/advertising/ad-templates";
import {
  getTemplatesByCategory as getDramaTemplates,
  type DramaTemplate,
} from "@/templates/drama/drama-templates";

interface TemplatePickerProps {
  scene: SceneId;
  onTemplateSelect: (template: EcommerceTemplate | AdvertisingTemplate | DramaTemplate) => void;
}

export function TemplatePicker({ scene, onTemplateSelect }: TemplatePickerProps) {
  const { t } = useTranslation();

  const getTemplates = () => {
    switch (scene) {
      case "ecommerce":
        return getTemplatesByPlatform("taobao", "main-image").slice(0, 6);
      case "advertising":
        return getAdTemplates("tvc").slice(0, 6);
      case "drama":
        return getDramaTemplates("script-to-image").slice(0, 6);
      default:
        return [];
    }
  };

  const templates = getTemplates();

  if (templates.length === 0) {
    return <Empty description="暂无模板" />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {templates.map((template) => (
        <Card
          key={template.id}
          hoverable
          size="small"
          className="cursor-pointer transition-all hover:border-blue-500 hover:shadow-md"
          onClick={() => onTemplateSelect(template)}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{template.name}</span>
              <Tag color="blue" className="!text-xs">
                {template.style}
              </Tag>
            </div>
            <p className="m-0 text-xs text-stone-500 line-clamp-2">
              {template.description}
            </p>
            <div className="flex flex-wrap gap-1">
              {template.tags?.slice(0, 3).map((tag) => (
                <Tag key={tag} className="!text-xs">
                  {tag}
                </Tag>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default TemplatePicker;
