# Nova P0 verify script - English only (avoid encoding issues on Chinese Windows)
$ErrorActionPreference = "Continue"
$report = @()
function Log($msg) { $report += $msg; Write-Host $msg }

Log "========== Nova P0 Verify =========="
Log "Time: $(Get-Date)"

$backendDir = "D:\nova启画\novacanvas\backend"
if (-not (Test-Path $backendDir)) { Log "ERROR: backend dir missing: $backendDir"; exit 1 }
Log "OK backend dir exists"

# 1. Go check/install
$goOk = $false
if (Get-Command go -ErrorAction SilentlyContinue) {
    Log "OK Go installed: $(go version)"
    $goOk = $true
} else {
    Log "Trying winget install Go..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install GoLang.Go --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (Get-Command go -ErrorAction SilentlyContinue) { Log "OK Go installed: $(go version)"; $goOk = $true }
    } else {
        Log "ERROR: no winget, please install Go 1.22+ manually"
    }
}

# 2. Docker + PG + Redis
$dockerOk = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Log "OK Docker daemon running"
        $dockerOk = $true
    } else {
        Log "Docker installed but not started, trying to launch..."
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        for ($i=0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 4
            docker info 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Log "OK Docker daemon started"; $dockerOk = $true; break }
        }
    }
} else {
    Log "ERROR: Docker not installed, please install Docker Desktop"
}

if ($dockerOk) {
    docker run -d --name nova-postgres -e POSTGRES_DB=nova_canvas -e POSTGRES_USER=nova -e POSTGRES_PASSWORD=nova_dev_password -p 5432:5432 postgres:14-alpine 2>&1 | Out-Null
    Start-Sleep -Seconds 8
    $pgResult = docker exec nova-postgres psql -U nova -d nova_canvas -tAc "SELECT 1;" 2>&1
    if ($pgResult -match "1") { Log "OK PostgreSQL connected: $pgResult" } else { Log "ERROR PostgreSQL: $pgResult" }

    docker run -d --name nova-redis -p 6379:6379 redis:6-alpine 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    $redisResult = docker exec nova-redis redis-cli ping 2>&1
    if ($redisResult -match "PONG") { Log "OK Redis connected: $redisResult" } else { Log "ERROR Redis: $redisResult" }
}

# 3. Generate JWT_SECRET and write .env
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
Log "OK .env written"

# 4. Build backend
if ($goOk) {
    Set-Location $backendDir
    Log "Running go mod tidy..."
    go mod tidy 2>&1 | Select-Object -Last 5
    Log "Running go build..."
    $buildOut = go build -o nova-backend.exe ./cmd/ 2>&1
    if (Test-Path "$backendDir\nova-backend.exe") {
        Log "OK build success: nova-backend.exe ($([math]::Round((Get-Item "$backendDir\nova-backend.exe").Length/1KB)) KB)"
    } else {
        Log "ERROR build failed: $buildOut"
    }
}

# 5. Start backend + smoke test
if (Test-Path "$backendDir\nova-backend.exe") {
    Log "Starting backend (check in 5s)..."
    Start-Process "$backendDir\nova-backend.exe" -WorkingDirectory $backendDir
    Start-Sleep -Seconds 5
    try {
        $health = curl.exe -s http://localhost:8080/api/v1/health
        if ($health -match "healthy") { Log "OK health check: $health" } else { Log "WARN health: $health" }
    } catch { Log "WARN health failed: $_" }
}

Log "========== Verify End =========="
$reportFile = "$backendDir\P0-VERIFY-REPORT.txt"
Set-Content -Path $reportFile -Value $report
Write-Host "`nReport saved: $reportFile"
