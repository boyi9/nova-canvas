import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  role?: "novice" | "director" | "photographer" | "editor" | "operator";
}

const ROLE_PLACEHOLDERS: Record<string, string> = {
  novice: "描述你想做什么，例如：帮我做一个保温杯的主图，卖点是24小时保温，发抖音",
  director: "输入创意指令，例如：15秒品牌广告片，主打情感共鸣，需分镜脚本+选角建议",
  photographer: "描述拍摄需求，例如：商品白底图，3个角度，需打光方案和相机参数",
  editor: "输入剪辑指令，例如：把素材剪成15秒短视频，卡点配乐，加字幕和转场",
  operator: "输入运营指令，例如：分析账号近7天数据，输出优化建议并生成执行计划",
};

export function CommandInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder,
  role = "novice",
}: CommandInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(56);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);

  const suggestions = [
    "帮我做一个{产品}的主图，卖点是{卖点}，发{平台}",
    "生成15秒{产品}短视频，风格{风格}，背景音乐{音乐}",
    "分析账号数据，输出本周优化建议和执行计划",
    "把{素材}剪成{时长}短视频，卡点{音乐}，加{字幕/转场}",
    "批量生成{数量}张{产品}详情页，风格统一，规格{尺寸}",
    "对标{竞品账号}，拆解爆款逻辑，生成复刻方案",
  ];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const h = Math.min(textareaRef.current.scrollHeight, 200);
      setHeight(h);
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    }
    if (e.key === "ArrowDown" && showSuggestions) {
      e.preventDefault();
      setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
    }
    if (e.key === "ArrowUp" && showSuggestions) {
      e.preventDefault();
      setSuggestionIndex((i) => Math.max(i - 1, -1));
    }
    if (e.key === "Tab" && showSuggestions && suggestionIndex >= 0) {
      e.preventDefault();
      onChange(suggestions[suggestionIndex]);
      setShowSuggestions(false);
      setSuggestionIndex(-1);
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
      setSuggestionIndex(-1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    setShowSuggestions(val.length > 0 && val.includes("{"));
    setSuggestionIndex(-1);
  };

  const applySuggestion = (s: string) => {
    onChange(s);
    setShowSuggestions(false);
    setSuggestionIndex(-1);
    if (textareaRef.current) textareaRef.current.focus();
  };

  return (
    <div className="relative">
      {/* 输入框 */}
      <div className={cn("relative bg-white rounded-xl border transition-all", disabled ? "border-gray-200 bg-gray-50" : "border-gray-300 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-ring/20")}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(value.length > 0 && value.includes("{"))}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          disabled={disabled}
          placeholder={placeholder || ROLE_PLACEHOLDERS[role]}
          className={cn(
            "w-full px-4 py-4 text-base text-gray-900 placeholder:text-muted-foreground",
            "bg-transparent border-none resize-none outline-none",
            "font-sans leading-relaxed",
            disabled && "text-muted-foreground cursor-not-allowed"
          )}
          style={{ height, minHeight: 56, maxHeight: 200 }}
          rows={1}
          spellCheck={false}
        />

        {/* 角色标识 */}
        <div className="absolute right-4 top-3 flex items-center gap-1">
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </span>
        </div>
      </div>

      {/* 变量建议下拉 */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => applySuggestion(s)}
              onMouseEnter={() => setSuggestionIndex(i)}
              className={cn(
                "w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors",
                i === suggestionIndex && "bg-blue-50 text-blue-700"
              )}
            >
              <span className="text-muted-foreground mr-2">↳</span>
              <span className="font-mono text-[12px]">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* 底部提示 */}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">Enter</kbd>
        <span>发送</span>
        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">Shift+Enter</kbd>
        <span>换行</span>
        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">Tab</kbd>
        <span>补全变量</span>
        {value.includes("{") && (
          <span className="text-blue-600">检测到变量，按 Tab 补全</span>
        )}
      </div>
    </div>
  );
}