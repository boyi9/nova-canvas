
#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== 开始初始化 Docker 部署环境 ===${NC}"

# 1. 检查 Docker 和 NVIDIA Container Toolkit 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装，请先安装 Docker${NC}"
    exit 1
fi

if ! nvidia-smi &> /dev/null; then
    echo -e "${RED}错误: 未检测到 NVIDIA GPU 驱动或 nvidia-smi 不可用${NC}"
    exit 1
fi

# 2. 检查显卡型号是否为 RTX 5070 (可选校验)
GPU_MODEL=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
if [[ $GPU_MODEL != *"RTX 5070"* ]]; then
    echo -e "${YELLOW}警告: 检测到的显卡为 ${GPU_MODEL}，非预期的 RTX 5070，显存配置可能不匹配${NC}"
else
    echo -e "${GREEN}检测到 RTX 5070 显卡，应用专属显存配置${NC}"
fi

# 3. 创建必要的目录结构
mkdir -p /d/ollama-models
mkdir -p ./ci-workspace
mkdir -p ./app

# 4. 构建 Docker 镜像
echo -e "${YELLOW}正在构建 Docker 镜像...${NC}"
docker-compose build --no-cache
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: Docker 镜像构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}Docker 镜像构建成功${NC}"

# 5. 启动容器
echo -e "${YELLOW}正在启动容器服务...${NC}"
docker-compose up -d
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 容器启动失败${NC}"
    exit 1
fi
echo -e "${GREEN}容器服务启动成功${NC}"

# 6. 等待服务就绪
echo -e "${YELLOW}等待 Ollama 服务就绪...${NC}"
sleep 10

# 7. 执行环境一致性校验
echo -e "${YELLOW}执行环境一致性校验...${NC}"

# 校验 CUDA 可用性
if docker exec local-ollama-rtx5070 nvidia-smi | grep -q "RTX 5070"; then
    echo -e "${GREEN}[PASS] GPU 识别正常${NC}"
else
    echo -e "${RED}[FAIL] GPU 识别失败${NC}"
fi

# 校验 Ollama 版本
OLLAMA_VER=$(docker exec local-ollama-rtx5070 ollama -v 2>/dev/null)
if [[ $OLLAMA_VER == *"0.32.13"* ]]; then
    echo -e "${GREEN}[PASS] Ollama 版本匹配 (0.32.13)${NC}"
else
    echo -e "${RED}[FAIL] Ollama 版本不匹配: ${OLLAMA_VER}${NC}"
fi

# 校验模型目录挂载
if docker exec local-ollama-rtx5070 ls /d/ollama-models &> /dev/null; then
    echo -e "${GREEN}[PASS] 模型缓存目录挂载正常${NC}"
else
    echo -e "${RED}[FAIL] 模型缓存目录挂载失败${NC}"
fi

# 校验 Python/pip 版本
PIP_VER=$(docker exec local-ollama-rtx5070 pip --version 2>/dev/null)
if [[ $PIP_VER == *"26.2.1"* ]]; then
    echo -e "${GREEN}[PASS] pip 版本匹配 (26.2.1)${NC}"
else
    echo -e "${RED}[FAIL] pip 版本不匹配: ${PIP_VER}${NC}"
fi

echo -e "${GREEN}=== 所有环境校验完成 ===${NC}"
echo -e "${GREEN}部署成功！Ollama 服务运行在 http://localhost:11434${NC}"
