# INFRA-001-V01: Ollama 服务校验
# 验证 Ollama 在 127.0.0.1:11434 可达（禁止用 localhost，会解析到 IPv6 ::1 导致 404）
# 验收：服务启动 | 11434 端口可访问 | 耗时记录完整
$ErrorActionPreference = 'Stop'
$uri = 'http://127.0.0.1:11434/api/tags'
$t0 = Get-Date
try {
    $resp = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 10
    $ms = [int]((Get-Date) - $t0).TotalMilliseconds
    if ($resp.StatusCode -eq 200) {
        Write-Output "OK Ollama reachable at 127.0.0.1:11434 in $ms ms"
        exit 0
    } else {
        Write-Output "FAIL Ollama returned HTTP $($resp.StatusCode)"
        exit 1
    }
} catch {
    Write-Output "FAIL Ollama not reachable at 127.0.0.1:11434 : $_"
    exit 1
}
