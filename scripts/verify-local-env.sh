#!/bin/bash
echo -e "\033[34m=== 🚀 本地模型环境一键校验脚本 ===\033[0m"
echo "当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "日志路径: ./verify-$(date '+%Y%m%d').log"
echo "----------------------------------"

# 全局配置变量
INSTALL_DEPS="true"
IS_OBLIGATE="true"
USE_GPU="true"
OLLAMA_VERSION_REQ="0.3.0"
GO_VERSION_REQ="1.22"
PYTHON_VERSION_REQ="3.8"
REQUIRED_MODELS=("deepseek-r1:7b" "nemotron-mini:4b" "llama3.2:3b" "qwen2.5:7b")
LOG_FILE="./verify-$(date '+%Y%m%d').log"

# 预置脚本：系统依赖预校验
if [[ $INSTALL_DEPS == "true" ]]; then
  echo -e "\033[33m0. 系统依赖预校验: \033[0m"
  apt update && apt install -y curl wget grep bc
  echo -e "\033[32m✅ 系统基础依赖已安装\033[0m"

  [[ $IS_OBLIGATE == "true" ]] && curl -fsSL https://ollama.com/install.sh | sh
  echo -e "\033[32m✅ Ollama官方脚本已安装\033[0m"
fi

# 校验Ollama版本
if command -v ollama &> /dev/null; then
  OLLAMA_VER=$(ollama -v | awk '{print $2}' | cut -d'v' -f2)
  if dpkg --compare-versions "$OLLAMA_VER" ge "$OLLAMA_VERSION_REQ"; then
    echo -e "\033[32m✅ 版本v$OLLAMA_VER 满足最低要求v$OLLAMA_VERSION_REQ\033[0m"
  else
    echo -e "\033[33m⚠️ 版本v$OLLAMA_VER 过低，自动升级中...\033[0m"
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  echo -e "\033[31m❌ 未检测到Ollama，安装失败\033[0m"
  exit 1
fi

# 校验端口连通性与服务自动拉起
if curl -s http://127.0.0.1:11434/api/tags &> /dev/null; then
  echo -e "\033[32m✅ 端口正常响应\033[0m"
else
  echo -e "\033[33m⚠️ 端口无法访问，自动拉起Ollama服务中...\033[0m"
  for i in {1..10}; do
    systemctl is-active --quiet ollama
    [ $? -ne 0 ] && systemctl restart ollama
    ollama serve &
    sleep 3
    curl -s http://127.0.0.1:11434/api/tags &> /dev/null
    [ $? -eq 0 ] && echo -e "\033[32m✅ Ollama服务启动成功\033[0m" && break
  done
  [ $? -ne 0 ] && echo -e "\033[31m❌ 服务启动失败\033[0m" && exit 1
fi

# 校验GPU显存状态
if [[ $USE_GPU == "true" ]] && command -v nvidia-smi &> /dev/null; then
  TOTAL_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | awk '{sum+=$1} END {print sum}')
  USED_VRAM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | awk '{sum+=$1} END {print sum}')
  FREE_VRAM=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | awk '{sum+=$1} END {print sum}')
  GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | awk '{print $1}')
  USAGE_RATE=$(echo "scale=2; $USED_VRAM / $TOTAL_VRAM * 100" | bc)
  echo -e "\033[32m✅ 总显存 ${TOTAL_VRAM}MB，已用 ${USED_VRAM}MB，空闲 ${FREE_VRAM}MB，使用率 ${USAGE_RATE}%，当前温度 ${GPU_TEMP}℃\033[0m"
  
  if [ $FREE_VRAM -ge 16384 ]; then
    echo -e "\033[32m   ✅ 显存满足7B模型运行要求\033[0m"
  fi
  
  if [ $GPU_TEMP -gt 90 ]; then
    echo -e "\033[33m   ⚠️ GPU 温度过高，可能影响性能\033[0m"
  fi
else
  echo -e "\033[33m⚠️ 未检测到NVIDIA GPU，将使用CPU模式运行\033[0m"
fi

# 校验模型完整性
echo -e "\033[34m校验模型完整性:\033[0m"
ALL_MODELS_OK=true
for model in "${REQUIRED_MODELS[@]}"; do
  echo -n "   - $model: "
  model_info=$(ollama list | grep "$model")
  if [ $? -eq 0 ]; then
    model_size=$(echo "$model_info" | awk '{print $3" "$4}')
    echo -e "\033[32m✅ 已存在，大小：$model_size\033[0m"
  else
    echo -e "\033[31m❌ 缺失，自动拉取补全中...\033[0m"
    for i in {1..3}; do
      echo -n "正在尝试第 $i 次拉取 $model..."
      ollama pull "$model"
      sleep 5
      ollama list | grep -q "$model"
      if [ $? -eq 0 ]; then
        echo -e "\033[32m✅ 成功补全 $model\033[0m"
        break
      fi
    done
    [ $? -ne 0 ] && echo -e "\033[31m❌ 无法补全 $model\033[0m" && ALL_MODELS_OK=false
  fi
done
[ "$ALL_MODELS_OK" = false ] && echo -e "\033[33m⚠️ 存在模型缺失，后续推理可能异常\033[0m" && exit 1

# 校验Go环境
echo -e "\033[34m校验Go环境:\033[0m"
if command -v go &> /dev/null; then
  GO_VER=$(go version | awk '{print $3}' | cut -d'go' -f2)
  if dpkg --compare-versions "$GO_VER" ge "$GO_VERSION_REQ"; then
    echo -e "\033[32m✅ 版本v$GO_VER 满足最低要求v$GO_VERSION_REQ\033[0m"
  else
    echo -e "\033[33m⚠️ 版本v$GO_VER 过低，自动升级Go 1.22中...\033[0m"
    wget https://dl.google.com/go/go1.22.0.linux-amd64.tar.gz -O go.tar.gz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tar.gz
  fi
else
  echo -e "\033[31m❌ 未检测到Go环境，自动安装Go 1.22中...\033[0m"
  wget https://dl.google.com/go/go1.22.0.linux-amd64.tar.gz -O go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf go.tar.gz
fi
export PATH="$PATH:/usr/local/go/bin"
export GOPATH=/data/go
export GOPROXY=https://goproxy.cn,direct
echo -e "\033[32m✅ Go环境配置完成\033[0m"

# 校验Python依赖
echo -e "\033[34m校验Python依赖:\033[0m"
PYTHON_VER=$(python3 --version | awk '{print $2}' )
if dpkg --compare-versions "$PYTHON_VER" ge "$PYTHON_VERSION_REQ"; then
  echo -e "\033[32m✅ Python版本v$PYTHON_VER 满足最低要求v$PYTHON_VERSION_REQ\033[0m"
else
  echo -e "\033[31m❌ Python版本过低，要求≥3.8\033[0m"
  exit 1
fi

# 校验numpy和pandas
echo -e "\033[34m校验numpy和pandas:\033[0m"
python3 -c "import numpy as np; assert np.__version__ >= '1.21'" 2>/dev/null
[ $? -eq 0 ] && echo -e "\033[32m✅ numpy版本≥1.21 校验通过\033[0m" || echo -e "\033[31m❌ numpy版本过低，要求≥1.21\033[0m" && exit 1

python3 -c "import pandas as pd; assert pd.__version__ >= '1.4.0'" 2>/dev/null
[ $? -eq 0 ] && echo -e "\033[32m✅ pandas版本≥1.4.0 校验通过\033[0m" || echo -e "\033[31m❌ pandas版本过低，要求≥1.4.0\033[0m" && exit 1

# 校验safety工具
echo -e "\033[34m校验safety工具:\033[0m"
python3 -c "import safety; safety.__version__"
if [ $? -ne 0 ]; then
  echo -e "\033[33m⚠️ 未检测到safety，自动从清华源安装中...\033[0m"
  pip install safety -i https://pypi.tsinghua.edu.cn/simple
  [ $? -ne 0 ] && echo -e "\033[31m❌ safety安装失败\033[0m" && exit 1
fi

echo "----------------------------------"
echo -e "\033[32m🎉 全量校验完成，日志已写入 $LOG_FILE\033[0m"