"use client";

import { 
  Shield, AlertTriangle, CheckCircle, XCircle, 
  Zap, Flame, DollarSign, Bell, 
  ChevronRight, ExternalLink, TrendingDown
} from "lucide-react";

interface FuseStatus {
  state: string;
  reason: string;
  triggered_at?: string;
  recovered_at?: string;
}

interface SafetyPanelProps {
  fuses: Record<string, FuseStatus>;
  redLineBlocks: number;
  lastDowngrade: string | null;
}

const FUSE_LABELS: Record<string, string> = {
  consecutive_failure: "连续失败",
  abnormal_drop: "异常掉量",
  rule_alert_p0: "违规预警",
  budget_overflow: "预算超限",
};

const FUSE_ICONS: Record<string, React.ReactNode> = {
  consecutive_failure: <XCircle className="w-5 h-5 text-red-500" />,
  abnormal_drop: <TrendingDown className="w-5 h-5 text-orange-500" />,
  rule_alert_p0: <AlertTriangle className="w-5 h-5 text-purple-500" />,
  budget_overflow: <DollarSign className="w-5 h-5 text-yellow-500" />,
};

const STATE_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  half_open: "bg-yellow-100 text-yellow-700 border-yellow-200",
  closed: "bg-green-100 text-green-700 border-green-200",
};

const STATE_LABELS: Record<string, string> = {
  open: "触发",
  half_open: "半开",
  closed: "正常",
};

interface SafetyPanelProps {
  fuses: Record<string, FuseStatus>;
  redLineBlocks: number;
  lastDowngrade: string | null;
}

const DEFAULT_FUSES: Array<[string, FuseStatus]> = [
    ["consecutive_failure", { state: "closed", reason: "无连续失败" }],
    ["abnormal_drop", { state: "closed", reason: "播放量正常" }],
    ["rule_alert_p0", { state: "closed", reason: "无 P0 预警" }],
    ["budget_overflow", { state: "closed", reason: "预算正常" }],
  ];

export function SafetyPanel({ fuses, redLineBlocks, lastDowngrade }: SafetyPanelProps) {
  const entries = Object.entries(fuses) as Array<[string, FuseStatus]>;
  const fuseEntries: Array<[string, FuseStatus]> = entries.length > 0 ? entries : DEFAULT_FUSES;

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-500" />
          安全线
        </h3>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 text-xs rounded-full ${redLineBlocks > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            红线拦截: {redLineBlocks}
          </span>
          {lastDowngrade && (
            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">
              最近降级: {new Date(lastDowngrade).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {fuseEntries.map(([key, fuse]) => {
          const label = FUSE_LABELS[key] || key;
          const icon = FUSE_ICONS[key] || <Zap className="w-5 h-5 text-gray-500" />;
          const stateColor = STATE_COLORS[fuse.state] || "bg-gray-100 text-gray-700";
          const stateLabel = STATE_LABELS[fuse.state] || fuse.state;

          return (
            <div key={key} className="p-4 hover:bg-gray-50 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">{label}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${stateColor}`}>
                    {stateLabel}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{fuse.reason}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {fuse.triggered_at && (
                    <span>触发: {new Date(fuse.triggered_at).toLocaleString()}</span>
                  )}
                  {fuse.recovered_at && (
                    <span className="text-green-600">
                      恢复: {new Date(fuse.recovered_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-white rounded-lg border">
            <p className="text-2xl font-bold text-red-500">{redLineBlocks}</p>
            <p className="text-xs text-gray-500">红线拦截</p>
          </div>
          <div className="p-3 bg-white rounded-lg border">
            <p className="text-2xl font-bold text-orange-500">
              {Object.values(fuses).filter(f => f.state === "open").length}
            </p>
            <p className="text-xs text-gray-500">活跃熔断</p>
          </div>
        </div>
      </div>
    </div>
  );
}