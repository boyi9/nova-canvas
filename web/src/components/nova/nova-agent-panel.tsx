// Nova启画 - Agent面板（对接真实LLM）
import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Input, Space, Tag, message } from "antd";
import { Send, Sparkles, Image, Film, Wand2, Video, Clapperboard } from "lucide-react";
import { NOVA_CONFIG, type SceneId } from "@/config/nova-config";
import { chatCompletion, type ChatMessage } from "@/services/nova/api";

interface NovaAgentPanelProps {
  scene: SceneId;
  onSendMessage: (message: string) => void;
  isGenerating: boolean;
}

const SCENE_QUICK_ACTIONS: Record<SceneId, Array<{ label: string; prompt: string; icon: React.ReactNode }>> = {
  ecommerce: [
    { label: "生成主图", prompt: "帮我生成一张电商主图，产品是", icon: <Image className="size-4" /> },
    { label: "详情页设计", prompt: "设计一个产品详情页，包含以下卖点", icon: <Wand2 className="size-4" /> },
    { label: "带货视频", prompt: "生成一个15秒的带货短视频", icon: <Film className="size-4" /> },
    { label: "爆款复刻", prompt: "参考这张图片的风格，复刻到我的产品", icon: <Sparkles className="size-4" /> },
  ],
  advertising: [
    { label: "TVC脚本", prompt: "写一个30秒的TVC广告脚本，品牌是", icon: <Video className="size-4" /> },
    { label: "品牌宣传片", prompt: "制作一个60秒的品牌形象宣传片", icon: <Wand2 className="size-4" /> },
    { label: "社媒短视频", prompt: "生成一个适合抖音的15秒产品展示视频", icon: <Film className="size-4" /> },
    { label: "节日营销", prompt: "制作一个春节主题的促销视频", icon: <Sparkles className="size-4" /> },
  ],
  drama: [
    { label: "剧本创作", prompt: "写一个3分钟的短剧剧本，主题是", icon: <Clapperboard className="size-4" /> },
    { label: "角色设计", prompt: "设计一个短剧主角，形象要求", icon: <Image className="size-4" /> },
    { label: "分镜生成", prompt: "根据剧本生成九宫格分镜", icon: <Wand2 className="size-4" /> },
    { label: "多集编排", prompt: "规划一个5集连续短剧的剧情", icon: <Sparkles className="size-4" /> },
  ],
};

export function NovaAgentPanel({ scene, onSendMessage, isGenerating }: NovaAgentPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickActions = SCENE_QUICK_ACTIONS[scene];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || inputValue;
    if (!messageText.trim() || isStreaming) return;

    const userMsg = { role: "user" as const, content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsStreaming(true);

    try {
      const chatMessages: ChatMessage[] = messages
        .concat(userMsg)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await chatCompletion(chatMessages, scene);

      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
    } catch (err: any) {
      console.error("Chat error:", err);

      let fallbackReply = "抱歉，AI服务暂时不可用。";
      if (err.code === 402) {
        fallbackReply = "您的积分已用完，请充值后重试。";
      } else if (err.code === 503) {
        fallbackReply = "AI模型服务正在维护中，请稍后重试。";
      } else if (err.detail) {
        fallbackReply = `服务异常：${err.detail}`;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: fallbackReply }]);
    } finally {
      setIsStreaming(false);
    }

    onSendMessage(messageText);
  }, [inputValue, isStreaming, messages, scene, onSendMessage]);

  const handleQuickAction = (prompt: string) => {
    setInputValue(prompt);
    handleSend(prompt);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-blue-500" />
          <span className="font-medium">Nova AI助手</span>
        </div>
        <Tag color="blue">{NOVA_CONFIG.scenes[scene].name}</Tag>
      </div>

      <div className="border-b px-4 py-2">
        <div className="mb-2 text-xs text-stone-500">快捷指令</div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              size="small"
              icon={action.icon}
              onClick={() => handleQuickAction(action.prompt)}
              disabled={isGenerating || isStreaming}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-stone-400">
            <Sparkles className="mb-4 size-12" />
            <p className="mb-2 text-lg font-medium">您好！我是Nova AI助手</p>
            <p className="text-sm">我可以帮您生成{NOVA_CONFIG.scenes[scene].name}</p>
            <p className="text-sm">点击上方快捷指令或直接输入需求开始创作</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-800">
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Nova正在思考...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t px-4 py-3">
        <Space.Compact className="w-full">
          <Input
            placeholder="输入您的创作需求..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={() => handleSend()}
            disabled={isGenerating || isStreaming}
          />
          <Button
            type="primary"
            icon={<Send />}
            onClick={() => handleSend()}
            disabled={isGenerating || isStreaming || !inputValue.trim()}
          >
            发送
          </Button>
        </Space.Compact>
      </div>
    </div>
  );
}

export default NovaAgentPanel;
