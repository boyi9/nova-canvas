// Nova启画 - 场景工作台组件（增强版）
import { useState } from "react";
import { Button, Card, Input, Space, Tabs, Upload, message, Modal } from "antd";
import { UploadOutlined, Wand2, Download, RefreshCw, Sparkles, Image, Film, Style } from "lucide-react";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";
import { checkAdCompliance } from "@/compliance/ad-law-checker";
import { TemplatePicker } from "./template-picker";
import { StyleTransferPicker } from "./style-transfer-picker";
import { NovaAgentPanel } from "./nova-agent-panel";

interface SceneWorkbenchProps {
  scene: SceneId;
  onGenerate: (prompt: string, options: any) => void;
}

export function SceneWorkbench({ scene, onGenerate }: SceneWorkbenchProps) {
  const [productName, setProductName] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showStyleTransfer, setShowStyleTransfer] = useState(false);
  const [activeTab, setActiveTab] = useState("template");

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      message.warning("请先选择模板");
      return;
    }

    // 合规检测
    if (NOVA_CONFIG.compliance.adLawCheckEnabled) {
      const complianceResult = checkAdCompliance(productName + " " + additionalContext);
      if (!complianceResult.isValid) {
        message.warning(`文案存在合规风险：${complianceResult.violations[0]?.suggestion}`);
        return;
      }
    }

    setIsGenerating(true);
    try {
      let prompt = selectedTemplate.prompt.replace(/\{product_name\}/g, productName || "product");
      if (additionalContext) {
        prompt += `, ${additionalContext}`;
      }
      onGenerate(prompt, {
        template: selectedTemplate,
        productName,
        scene,
      });
      message.success("生成任务已提交");
    } catch (error) {
      message.error("生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAgentMessage = (message: string) => {
    console.log("Agent message:", message);
    // TODO: 处理Agent消息
  };

  return (
    <div className="flex gap-4">
      {/* Main Workbench */}
      <Card className="flex-1">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-lg font-medium">
              {NOVA_CONFIG.scenes[scene].name}工作台
            </h3>
            <Space>
              <Button
                icon={<Sparkles />}
                onClick={() => setShowAgent(true)}
              >
                AI助手
              </Button>
              <Button icon={<Download />}>导出</Button>
              <Button
                type="primary"
                icon={<Wand2 />}
                onClick={handleGenerate}
                loading={isGenerating}
              >
                AI生成
              </Button>
            </Space>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-stone-600 dark:text-stone-400">
                产品名称
              </label>
              <Input
                placeholder="输入产品名称"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-stone-600 dark:text-stone-400">
                补充描述
              </label>
              <Input.TextArea
                placeholder="补充场景、风格等描述（可选）"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                rows={1}
              />
            </div>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "template",
                label: "模板选择",
                children: (
                  <TemplatePicker
                    scene={scene}
                    onTemplateSelect={setSelectedTemplate}
                  />
                ),
              },
              {
                key: "style",
                label: "风格迁移",
                children: <StyleTransferPicker onSelect={(config) => console.log("Style selected:", config)} />,
              },
            ]}
          />

          {selectedTemplate && (
            <Card size="small" className="!bg-stone-50 dark:!bg-stone-800">
              <p className="m-0 text-xs text-stone-500">
                <strong>生成提示词：</strong>
                {selectedTemplate.prompt
                  .replace(/\{product_name\}/g, productName || "[产品名]")
                  .replace(/\{brand_name\}/g, "[品牌名]")
                  .replace(/\{scene\}/g, "[场景]")
                  .replace(/\{character_name\}/g, "[角色名]")
                  .replace(/\{scene_description\}/g, "[场景描述]")
                  .replace(/\{episode_count\}/g, "[集数]")
                  .replace(/\{text\}/g, "[文案]")
                  .replace(/\{company_name\}/g, "[公司名]")
                  .replace(/, [^,]*$/, "")}
                {additionalContext && `, ${additionalContext}`}
              </p>
            </Card>
          )}
        </div>
      </Card>

      {/* Agent Panel Modal */}
      <Modal
        title="Nova AI助手"
        open={showAgent}
        onCancel={() => setShowAgent(false)}
        footer={null}
        width={480}
        styles={{ body: { height: 500, padding: 0 } }}
      >
        <NovaAgentPanel
          scene={scene}
          onSendMessage={handleAgentMessage}
          isGenerating={isGenerating}
        />
      </Modal>
    </div>
  );
}

export default SceneWorkbench;
