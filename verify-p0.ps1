# Nova启画 P0 一键验证脚本
# 在你的 Windows 机器上以管理员身份运行此脚本（保存为 verify-p0.ps1）
# 用法: powershell -ExecutionPolicy Bypass -File verify-p0.ps1

$ErrorActionPreference = "Continue"
$report = @()
function Log($msg) { $report += $msg; Write-Host $msg }

Log "========== Nova启画 P0 验证脚本 =========="
Log "时间: $(Get-Date)"

# ---------- 0. 目录定位 ----------
$backendDir = "D:\nova启画\novacanvas\backend"
if (-not (Test-Path $backendDir)) { Log "❌ 后端目录不存在: $backendDir"; exit 1 }
Log "✅ 后端目录存在"

# ---------- 1. 检查/安装 Go ----------
$goOk = $false
if (Get-Command go -ErrorAction SilentlyContinue) {
    Log "✅ Go 已安装: $(go version)"
    $goOk = $true
} else {
    Log "⏳ Go 未安装，尝试 winget 安装..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install GoLang.Go --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (Get-Command go -ErrorAction SilentlyContinue) { Log "✅ Go 安装成功: $(go version)"; $goOk = $true }
    } else {
        Log "❌ 无 winget，请手动安装 Go 1.22+ 后重跑本脚本"
    }
}

# ---------- 2. 检查/启动 Docker + PG + Redis ----------
$dockerOk = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Log "✅ Docker daemon 运行中"
            $dockerOk = $true
        } else {
            Log "⏳ Docker 已安装但未启动，尝试启动 Docker Desktop..."
            Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
            for ($i=0; $i -lt 30; $i++) {
                Start-Sleep -Seconds 4
                docker info 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) { Log "✅ Docker daemon 启动成功"; $dockerOk = $true; break }
            }
        }
    } catch { Log "⚠️ Docker 启动异常: $_" }
} else {
    Log "❌ 未安装 Docker，请安装 Docker Desktop 后重跑"
}

if ($dockerOk) {
    # PG
    docker run -d --name nova-postgres -e POSTGRES_DB=nova_canvas -e POSTGRES_USER=nova -e POSTGRES_PASSWORD=nova_dev_password -p 5432:5432 postgres:14-alpine 2>&1 | Out-Null
    Start-Sleep -Seconds 8
    $pgResult = docker exec nova-postgres psql -U nova -d nova_canvas -tAc "SELECT 1;" 2>&1
    if ($pgResult -match "1") { Log "✅ PostgreSQL 连通: SELECT 1 = $pgResult" } else { Log "❌ PostgreSQL 验证失败: $pgResult" }

    # Redis
    docker run -d --name nova-redis -p 6379:6379 redis:6-alpine 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    $redisResult = docker exec nova-redis redis-cli ping 2>&1
    if ($redisResult -match "PONG") { Log "✅ Redis 连通: $redisResult" } else { Log "❌ Redis 验证失败: $redisResult" }
}

# ---------- 3. 生成 JWT_SECRET 并写入 .env ----------
$jwtBytes = New-Object Byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($jwtBytes)
$jwt = [BitConverter]::ToString($jwtBytes) -replace '-',''

$envContent = @"
PORT=8080
GIN_MODE=debug
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
JWT_SECRET=$jwt
DB_HOST=localhost
DB_PORT=5432
DB_USER=nova
DB_PASSWORD=nova_dev_password
DB_NAME=nova_canvas
DB_SSLMODE=disable
REDIS_ADDR=localhost:6379
DEEPSEEK_API_KEY=
SEEDREAM_API_KEY=
SEEDANCE_API_KEY=
FLUX_API_KEY=
"@
Set-Content -Path "$backendDir\.env" -Value $envContent -Encoding utf8
Log "✅ .env 已生成 (JWT_SECRET 已写入)"

# ---------- 4. 编译后端 ----------
if ($goOk) {
    Set-Location $backendDir
    Log "⏳ 下载依赖 (go mod tidy)..."
    go mod tidy 2>&1 | Select-Object -Last 5
    Log "⏳ 编译 (go build)..."
    $buildOut = go build -o nova-backend.exe ./cmd/ 2>&1
    if (Test-Path "$backendDir\nova-backend.exe") {
        Log "✅ 编译成功: nova-backend.exe ($([math]::Round((Get-Item "$backendDir\nova-backend.exe").Length/1KB)) KB)"
    } else {
        Log "❌ 编译失败: $buildOut"
    }
}

# ---------- 5. 启动后端 + 冒烟测试 ----------
if (Test-Path "$backendDir\nova-backend.exe") {
    Log "⏳ 启动后端服务 (5秒后检测)..."
    Start-Process "$backendDir\nova-backend.exe" -WorkingDirectory $backendDir
    Start-Sleep -Seconds 5
    try {
        $health = curl.exe -s http://localhost:8080/api/v1/health
        if ($health -match "healthy") { Log "✅ 健康检查通过: $health" } else { Log "⚠️ 健康检查异常: $health" }
    } catch { Log "⚠️ 健康检查请求失败: $_" }
}

# ---------- 输出报告 ----------
Log "========== 验证结束 =========="
$reportFile = "$backendDir\P0-VERIFY-REPORT.txt"
Set-Content -Path $reportFile -Value $report
Write-Host "`n报告已保存: $reportFile"
Write-Host "请将此文件内容 + 控制台截图回传给工程师"
