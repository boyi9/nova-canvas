"use client";

import { 
  Users, Shield, TrendingUp, AlertTriangle, 
  CheckCircle, XCircle, Activity, Wifi,
  Music, BookOpen, Film, Tv, Globe, Smartphone
} from "lucide-react";

interface MatrixAccount {
  id: string;
  username: string;
  platform: string;
  hosting_level: string;
  health: string;
  status: string;        // active | paused | frozen
  quota_used: number;
  quota_cap: number;
}

interface MatrixHealthProps {
  accounts: MatrixAccount[];
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  douyin: <Music className="size-4 text-pink-500" />,
  xiaohongshu: <BookOpen className="size-4 text-red-500" />,
  kuaishou: <Film className="size-4 text-orange-500" />,
  video_channel: <Tv className="size-4 text-green-500" />,
  tiktok: <Globe className="size-4" />,
};

const LEVEL_COLORS: Record<string, string> = {
  L0: "bg-gray-100 text-gray-700",
  L1: "bg-blue-100 text-blue-700",
  L2: "bg-yellow-100 text-yellow-700",
  L3: "bg-orange-100 text-orange-700",
  L4: "bg-red-100 text-red-700",
};

const LEVEL_LABELS: Record<string, string> = {
  L0: "全人工",
  L1: "AI辅助",
  L2: "半自动",
  L3: "全托管",
  L4: "无人值守",
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  critical: "bg-red-100 text-red-700",
  frozen: "bg-gray-100 text-gray-700",
};

const HEALTH_LABELS: Record<string, string> = {
  healthy: "健康",
  warning: "预警",
  critical: "危险",
  frozen: "冻结",
};

interface MatrixHealthProps {
  accounts: MatrixAccount[];
}

export function MatrixHealth({ accounts }: MatrixHealthProps) {
  const total = accounts.length;
  const active = accounts.filter(a => a.status === "active").length;
  const paused = accounts.filter(a => a.status === "paused").length;
  const frozen = accounts.filter(a => a.status === "frozen").length;

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          账号矩阵
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {active}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> {paused}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {frozen}</span>
        </div>
      </div>
      <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
        {accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Users className="mx-auto w-10 h-10 mb-2 text-gray-300" />
            <p>暂无授权账号</p>
            <p className="text-sm mt-1">前往授权中心添加账号</p>
          </div>
        ) : (
          accounts.slice(0, 6).map((account) => (
            <div key={account.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">
                    {PLATFORM_ICONS[account.platform] || <Smartphone className="size-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">@{account.username}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${LEVEL_COLORS[account.hosting_level] || "bg-gray-100 text-gray-700"}`}>
                        {LEVEL_LABELS[account.hosting_level] || account.hosting_level}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${HEALTH_COLORS[account.health] || "bg-gray-100 text-gray-700"}`} />
                        {HEALTH_LABELS[account.health] || account.health}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        配额: {account.quota_used}/{account.quota_cap}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400">{account.platform}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}