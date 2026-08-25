# INFRA-001-V02: 4 模型完整性校验
# 验证本地必备的 4 款模型均存在，缺失任一立即 exit 1
# 验收：4 款模型均存在 | 缺失模型立即 exit 1 | 日志记录完整
$ErrorActionPreference = 'Stop'
$required = @('deepseek-r1:7b', 'qwen2.5:7b', 'nemotron-mini:4b', 'llama3.2:3b')
try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 10
    $json = $resp.Content | ConvertFrom-Json
    $have = @($json.models | ForEach-Object { $_.name })
} catch {
    Write-Output "FAIL cannot list models from Ollama: $_"
    exit 1
}
$missing = @()
foreach ($m in $required) {
    if (-not ($have -contains $m)) { $missing += $m }
}
if ($missing.Count -eq 0) {
    Write-Output "OK all 4 required models present: $($required -join ', ')"
    exit 0
} else {
    Write-Output "FAIL missing models: $($missing -join ', ')"
    exit 1
}
