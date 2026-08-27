#!/usr/bin/env bash
# Cross-platform local model / agent environment verification for Nova Canvas.
#
# Runs on Linux, macOS and Windows (Git Bash / WSL). OS-specific behaviours are
# guarded so the script never assumes apt/systemctl/dpkg/nvidia-smi.
#
# Usage:
#   bash scripts/verify-local-env.sh            # verify, install deps if missing
#   INSTALL_DEPS=false bash scripts/verify-local-env.sh   # check-only
#   GO_INSTALL=true   bash scripts/verify-local-env.sh    # also fetch Go if absent
set -uo pipefail

echo -e "\033[34m=== Nova Canvas 本地模型环境校验 ===\033[0m"
echo "当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
LOG_FILE="./verify-$(date '+%Y%m%d').log"
echo "日志路径: $LOG_FILE"
echo "----------------------------------"

# ---- 全局配置 ----
INSTALL_DEPS="${INSTALL_DEPS:-true}"
GO_INSTALL="${GO_INSTALL:-false}"
USE_GPU="${USE_GPU:-true}"
OLLAMA_VERSION_REQ="0.3.0"
GO_VERSION_REQ="1.22"
PYTHON_VERSION_REQ="3.8"
REQUIRED_MODELS=("deepseek-r1:7b" "nemotron-mini:4b" "llama3.2:3b" "qwen2.5:7b")

# ---- 平台探测 ----
OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Linux*)   PLATFORM=linux ;;
  Darwin*)  PLATFORM=macos ;;
  MINGW*|MSYS*|CYGWIN*|*_NT*) PLATFORM=windows ;;
  *)        PLATFORM=unknown ;;
esac
ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$ARCH" in
  x86_64|amd64) GOARCH=amd64 ;;
  arm64|aarch64) GOARCH=arm64 ;;
  *) GOARCH=amd64 ;;
esac
echo "平台: $PLATFORM ($ARCH)"

# python 命令探测（Windows 上可能叫 python）
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python  >/dev/null 2>&1; then PY=python
else PY=missing; fi

# ---- 可移植版本比较（不依赖 dpkg/sort -V） ----
version_ge() {
  local a="$1" b="$2" i
  local IFS=.
  local pa=($a) pb=($b)
  for i in 0 1 2; do
    local na=${pa[i]:-0} nb=${pb[i]:-0}
    na=${na%%[^0-9]*}; nb=${nb%%[^0-9]*}
    na=$((10#${na:-0})); nb=$((10#${nb:-0}))
    [ "$na" -gt "$nb" ] && return 0
    [ "$na" -lt "$nb" ] && return 1
  done
  return 0
}

# ---- 0. 系统依赖预校验 ----
if [ "$INSTALL_DEPS" = "true" ]; then
  echo -e "\033[33m0. 系统依赖预校验:\033[0m"
  case "$PLATFORM" in
    linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y curl wget grep bc
      else
        echo "   (非 Debian 系，跳过 apt；请确认 curl/wget/bc 已安装)"
      fi ;;
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install curl wget bc grep 2>/dev/null || true
      else
        echo "   未检测到 brew，请手动安装 Xcode CLT / Homebrew 以提供 curl/wget/bc"
      fi ;;
    windows)
      echo "   Windows(Git Bash)：curl/wget 通常已随 Git 提供；bc 可选（显存占比计算跳过）"
      command -v bc >/dev/null 2>&1 || echo "   ⚠️ 缺少 bc，GPU 使用率百分比将不计算" ;;
    *)
      echo "   未知平台，跳过依赖安装" ;;
  esac
  echo -e "\033[32m✅ 系统基础依赖检查完成\033[0m"
fi

# ---- 1. Ollama 安装（仅缺失时，给出安全指引，不盲目 pipe 到 sh） ----
if ! command -v ollama >/dev/null 2>&1; then
  echo -e "\033[31m❌ 未检测到 ollama\033[0m"
  case "$PLATFORM" in
    macos) echo "   安装: brew install ollama" ;;
    linux) echo "   安装: curl -fsSL https://ollama.com/install.sh | sh  (请自行确认后执行)" ;;
    windows) echo "   安装: 从 https://ollama.com/download 获取 Windows 安装包" ;;
  esac
  exit 1
fi

OLLAMA_VER="$(ollama -v 2>/dev/null | awk '{print $2}' | tr -d 'v' | cut -d'.' -f1-3)"
if version_ge "$OLLAMA_VER" "$OLLAMA_VERSION_REQ"; then
  echo -e "\033[32m✅ Ollama v$OLLAMA_VER 满足最低要求 v$OLLAMA_VERSION_REQ\033[0m"
else
  echo -e "\033[33m⚠️ Ollama v$OLLAMA_VER 过低，建议升级到 >= v$OLLAMA_VERSION_REQ\033[0m"
fi

# ---- 2. 端口连通性与服务拉起（统一用 127.0.0.1，避免 IPv6 误报） ----
start_ollama() {
  if [ "$PLATFORM" = "linux" ] && command -v systemctl >/dev/null 2>&1; then
    systemctl is-active --quiet ollama || systemctl start ollama 2>/dev/null || true
  fi
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "   ⚠️ 端口无响应，后台启动 ollama serve ..."
    nohup ollama serve >"$LOG_FILE.serve" 2>&1 &
    for i in $(seq 1 10); do sleep 3; curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; done
  fi
}
start_ollama
if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo -e "\033[32m✅ 端口 127.0.0.1:11434 正常响应\033[0m"
else
  echo -e "\033[31m❌ Ollama 服务启动失败\033[0m"
  exit 1
fi

# ---- 3. GPU 显存状态（仅 NVIDIA 驱动存在时） ----
if [ "$USE_GPU" = "true" ] && command -v nvidia-smi >/dev/null 2>&1; then
  TOTAL_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | awk '{s+=$1} END{print s}')
  USED_VRAM=$(nvidia-smi --query-gpu=memory.used  --format=csv,noheader,nounits | awk '{s+=$1} END{print s}')
  FREE_VRAM=$(nvidia-smi --query-gpu=memory.free  --format=csv,noheader,nounits | awk '{s+=$1} END{print s}')
  GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | awk '{print $1}')
  echo -e "\033[32m✅ 总显存 ${TOTAL_VRAM}MB，已用 ${USED_VRAM}MB，空闲 ${FREE_VRAM}MB，温度 ${GPU_TEMP}℃\033[0m"
  [ "$FREE_VRAM" -ge 16384 ] && echo -e "\033[32m   ✅ 显存满足 7B 模型要求\033[0m"
  [ "$GPU_TEMP" -gt 90 ] && echo -e "\033[33m   ⚠️ GPU 温度过高\033[0m"
  if command -v bc >/dev/null 2>&1; then
    USAGE_RATE=$(echo "scale=2; $USED_VRAM / $TOTAL_VRAM * 100" | bc)
    echo "   使用率 ${USAGE_RATE}%"
  fi
else
  echo -e "\033[33m⚠️ 未检测到 NVIDIA GPU，按 CPU 模式运行\033[0m"
fi

# ---- 4. 模型完整性 ----
echo -e "\033[34m校验模型完整性:\033[0m"
ALL_MODELS_OK=true
for model in "${REQUIRED_MODELS[@]}"; do
  echo -n "   - $model: "
  if ollama list 2>/dev/null | grep -q "$model"; then
    echo -e "\033[32m✅ 已存在\033[0m"
  else
    if [ "${PULL_MODELS:-true}" = "true" ]; then
      echo -e "\033[31m❌ 缺失，尝试拉取...\033[0m"
      ok=false
      for i in 1 2 3; do
        echo -n "     第 $i 次拉取..."
        ollama pull "$model" >/dev/null 2>&1 && ok=true && break
        sleep 2
      done
      $ok || { echo -e "\033[31m❌ 无法补全 $model\033[0m"; ALL_MODELS_OK=false; }
    else
      echo -e "\033[33m⚠️ 缺失（PULL_MODELS=false，仅检查不拉取）\033[0m"
      ALL_MODELS_OK=false
    fi
  fi
done
[ "$ALL_MODELS_OK" = false ] && echo -e "\033[33m⚠️ 存在模型缺失，后续推理可能异常\033[0m" && exit 1

# ---- 5. Go 环境 ----
echo -e "\033[34m校验 Go 环境:\033[0m"
if command -v go >/dev/null 2>&1; then
  GO_VER="$(go version | awk '{print $3}' | sed 's/^go//')"
  if version_ge "$GO_VER" "$GO_VERSION_REQ"; then
    echo -e "\033[32m✅ Go v$GO_VER 满足最低要求 v$GO_VERSION_REQ\033[0m"
  else
    echo -e "\033[33m⚠️ Go v$GO_VER 过低\033[0m"
  fi
elif [ "$GO_INSTALL" = "true" ]; then
  GO_DL="go${GO_VERSION_REQ}.${PLATFORM}-${GOARCH}"
  case "$PLATFORM" in
    linux|macos)
      curl -fsSL "https://go.dev/dl/${GO_DL}.tar.gz" -o go.tar.gz
      sudo tar -C /usr/local -xzf go.tar.gz && export PATH="$PATH:/usr/local/go/bin" ;;
    windows)
      curl -fsSL "https://go.dev/dl/${GO_DL}.zip" -o go.zip
      powershell -NoProfile -Command "Expand-Archive -Force go.zip C:\\go" && export PATH="$PATH:/c/go/bin" ;;
  esac
  echo -e "\033[32m✅ Go 已安装\033[0m"
else
  echo -e "\033[33m⚠️ 未检测到 Go（CI 一般由 setup-go 提供；本地可设 GO_INSTALL=true 自动安装）\033[0m"
fi

# ---- 6. Python 依赖 ----
echo -e "\033[34m校验 Python 依赖:\033[0m"
if [ "$PY" = "missing" ]; then
  echo -e "\033[31m❌ 未检测到 python3/python\033[0m"; exit 1
fi
PY_VER="$($PY --version 2>&1 | awk '{print $2}')"
if version_ge "$PY_VER" "$PYTHON_VERSION_REQ"; then
  echo -e "\033[32m✅ Python v$PY_VER 满足最低要求 v$PYTHON_VERSION_REQ\033[0m"
else
  echo -e "\033[31m❌ Python 版本过低，要求 >= $PYTHON_VERSION_REQ\033[0m"; exit 1
fi

for pkg in numpy pandas; do
  if $PY -c "import $pkg" >/dev/null 2>&1; then
    echo -e "\033[32m✅ $pkg 可用\033[0m"
  else
    echo -e "\033[33m⚠️ 缺少 $pkg（可选，按需 pip install $pkg）\033[0m"
  fi
done
if ! $PY -c "import safety" >/dev/null 2>&1; then
  echo -e "\033[33m⚠️ 未检测到 safety（可选，CI 中按需 pip install safety）\033[0m"
fi

echo "----------------------------------"
echo -e "\033[32m🎉 全量校验完成，日志已写入 $LOG_FILE\033[0m"
