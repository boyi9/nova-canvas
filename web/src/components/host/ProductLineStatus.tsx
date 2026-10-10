"use client";

import { Truck, Package, BarChart2, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

interface ProductLineItem {
  id: string;
  name: string;
  status: "planned" | "in_progress" | "completed" | "failed";
  progress: number;
  current_stage: string;
}

interface ProductLineStatusProps {
  items: ProductLineItem[];
}

export function ProductLineStatus({ items }: ProductLineStatusProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "in_progress": return <Truck className="w-5 h-5 text-blue-500" />;
      case "failed": return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Package className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "已完成";
      case "in_progress": return "进行中";
      case "failed": return "失败";
      default: return "计划中";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-700";
      case "in_progress": return "bg-blue-100 text-blue-700";
      case "failed": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-500" />
          产线状态
        </h3>
        <span className="text-sm text-gray-500">{items.length} 条产线</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Package className="mx-auto w-10 h-10 mb-2 text-gray-300" />
            <p>暂无产线任务</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(item.status)}
                  <span className="font-medium text-gray-900">{item.name}</span>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(item.status)}`}>
                  {getStatusLabel(item.status)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div 
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">当前阶段：{item.current_stage}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "in_progress": return "bg-blue-100 text-blue-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}