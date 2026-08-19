#!/bin/bash
# 增强版本地模型校验Wrapper
AUTO_RETRY=3
SYNC_BOARD=false

# 解析传入参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --auto-retry)
      AUTO_RETRY="$2"
      shift # 跳过参数名
      shift # 跳过参数值
      ;;
    --sync-board)
      SYNC_BOARD=true
      shift
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

echo "=== 🚀 增强版GPU Runner环境校验启动 ==="
echo "自动重试次数: $AUTO_RETRY"
echo "结果同步看板: $SYNC_BOARD"
echo "----------------------------------"

# 执行核心校验脚本，支持自动重试
for i in $(seq 1 $AUTO_RETRY); do
  ./scripts/verify-local-env.sh
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 第 $i 次校验执行成功"
    break
  fi
  echo "⚠️ 第 $i 次校验执行失败，自动重试中..."
  sleep 3
done

# 校验结果同步到看板
if [ $SYNC_BOARD == true ]; then
  echo "🔄 正在同步校验结果到团队看板..."
  /usr/local/bin/sync-board --log-path ./verify-$(date '+%Y%m%d').log
  echo "✅ 看板状态同步完成"
fi

echo "🎉 全流程执行结束"
exit $EXIT_CODE