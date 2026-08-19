#!/bin/bash
echo "=== 🚀 GPU Runner 全量环境一键部署 ==="
# 1. 同步项目最新代码
cd ~/workspace && git pull origin main
# 2. 赋予所有脚本执行权限
chmod +x scripts/*.sh
# 3. 部署sync-board工具到系统路径
cp scripts/sync-board.sh /usr/local/bin/sync-board
chmod +x /usr/local/bin/sync-board
# 4. 预置国内Go加速源
echo "export GOPROXY=https://goproxy.cn,direct" >> /etc/profile
source /etc/profile
# 5. 预置SSH免密配置
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# 6. 首次执行全量环境校验
./scripts/run-local-verify.sh --auto-retry 3 --sync-board true
echo "✅ 所有配置部署完成，run-local-verify命令可直接使用"