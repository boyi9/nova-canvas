"use client";

import { 
  Truck, Shield, Package, AlertCircle, CheckCircle,
  Clock, User, AlertTriangle, ChevronRight
} from "lucide-react";

interface HandoffCardProps {
  type: string;
  typeLabel: string;
  typeIcon: React.ReactNode;
  title: string;
  project: string;
  assignee: string;
  state: string;
  stateBadge: React.ReactNode;
  slaText: string;
  slaUrgent: boolean;
  onAction: () => void;
  compact?: boolean;
}

export function HandoffCard({
  type,
  typeLabel,
  typeIcon,
  title,
  project,
  assignee,
  state,
  stateBadge,
  slaText,
  slaUrgent,
  onAction,
  compact = false,
}: HandoffCardProps) {
  const getUrgencyColor = () => {
    if (slaUrgent) return "text-red-500 bg-red-50 border-red-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  if (compact) {
    return (
      <div className="p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            {typeIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 truncate">{title}</span>
              {stateBadge}
            </div>
            <p className="text-sm text-gray-500 truncate mt-0.5">{project}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {assignee}
              </span>
              <span className={`flex items-center gap-1 ${slaUrgent ? "text-red-500" : ""}`}>
                <Clock className="w-3 h-3" /> SLA: {slaText}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onAction}
              className="px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded"
            >
              处理
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 border-b border-gray-100 ${getUrgencyColor()} hover:bg-gray-50 transition-colors`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          {typeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg font-semibold text-gray-900">{title}</span>
            {stateBadge}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> 项目: {project}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> 负责人: {assignee}
            </span>
            <span className={`flex items-center gap-1 ${slaUrgent ? "text-red-500 font-medium" : ""}`}>
              <Clock className="w-3 h-3" /> SLA 剩余: {slaText}
            </span>
          </div>
          {compact ? null : (
            <div className="pt-3 border-t border-gray-200">
              <button
                onClick={onAction}
                className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center justify-center gap-2"
              >
                立即处理
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}