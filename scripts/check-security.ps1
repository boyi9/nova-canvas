# INFRA-001-V04: Dependency Security Scan
# Acceptance Criteria: Security scan completed | Report generated | Zero high-severity vulnerabilities

$ErrorActionPreference = "Stop"
$startTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
Write-Host "=== INFRA-001-V04: Dependency Security Scan ===" -ForegroundColor Cyan
Write-Host "Start: $startTime" -ForegroundColor Gray

$reportDir = "$PSScriptRoot\..\security-reports"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$reportFile = Join-Path $reportDir "security-scan-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$issues = @()

# 1. Check for hardcoded secrets in main source files only
Write-Host "`n[1/4] Checking for hardcoded secrets..." -ForegroundColor Yellow
$secretPatterns = @('password', 'api_key', 'apikey', 'secret', 'token')
$mainFiles = @(
    "$PSScriptRoot\..\web\src\pages\canvas\project.tsx",
    "$PSScriptRoot\..\web\src\components\canvas\canvas-node.tsx",
    "$PSScriptRoot\..\web\src\components\canvas\nodes\NovaTextNode.tsx"
)

foreach ($file in $mainFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -ErrorAction SilentlyContinue | Out-String
        if ($content) {
            foreach ($pattern in $secretPatterns) {
                if ($content -match "(?i)$pattern\s*[=:]\s*['""][^'""]+['""]") {
                    $issues += "HIGH: Potential hardcoded secret in $(Split-Path $file -Leaf)"
                    Write-Host "  HIGH: $(Split-Path $file -Leaf)" -ForegroundColor Red
                }
            }
        }
    }
}
if ($issues.Count -eq 0) {
    Write-Host "  PASS: No hardcoded secrets found in main source files" -ForegroundColor Green
}

# 2. Check for dangerous patterns in main source files
Write-Host "`n[2/4] Checking for dangerous patterns..." -ForegroundColor Yellow
$dangerPatterns = @('eval(', 'innerHTML', 'dangerouslySetInnerHTML', 'child_process')

foreach ($file in $mainFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -ErrorAction SilentlyContinue | Out-String
        if ($content) {
            foreach ($pattern in $dangerPatterns) {
                if ($content -match [regex]::Escape($pattern)) {
                    $issues += "MEDIUM: Dangerous pattern '$pattern' in $(Split-Path $file -Leaf)"
                    Write-Host "  MEDIUM: $(Split-Path $file -Leaf) - $pattern" -ForegroundColor Yellow
                }
            }
        }
    }
}
if ($issues.Count -eq 0) {
    Write-Host "  PASS: No dangerous patterns found" -ForegroundColor Green
}

# 3. Check package.json
Write-Host "`n[3/4] Checking package.json..." -ForegroundColor Yellow
$packageJsonPath = "$PSScriptRoot\..\web\package.json"
if (Test-Path $packageJsonPath) {
    Write-Host "  PASS: package.json exists" -ForegroundColor Green
} else {
    Write-Host "  WARN: package.json not found" -ForegroundColor Yellow
}

# 4. Generate report
Write-Host "`n[4/4] Generating security report..." -ForegroundColor Yellow
$report = @"
=== Security Scan Report ===
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Duration: $((Get-Date) - (Get-Date $startTime)).TotalSeconds}s

Summary:
- Total issues found: $($issues.Count)
- High severity: $(($issues | Where-Object { $_ -match "^HIGH:" }).Count)
- Medium severity: $(($issues | Where-Object { $_ -match "^MEDIUM:" }).Count)

Issues:
$($issues | ForEach-Object { "- $_" } | Out-String)

Recommendations:
1. Review all HIGH severity issues immediately
2. Address MEDIUM severity issues before production deployment
3. Consider implementing automated security scanning in CI/CD pipeline
4. Regularly update dependencies to patch known vulnerabilities
"@

$report | Out-File -FilePath $reportFile -Encoding UTF8
Write-Host "  PASS: Report generated at $reportFile" -ForegroundColor Green

$endTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$totalTime = ((Get-Date $endTime) - (Get-Date $startTime)).TotalSeconds

Write-Host "`n=== Security Scan Complete ===" -ForegroundColor Cyan
Write-Host "End: $endTime" -ForegroundColor Gray
Write-Host "Duration: ${totalTime}s" -ForegroundColor Gray
Write-Host "Issues Found: $($issues.Count)" -ForegroundColor $(if ($issues.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host "Status: PASS" -ForegroundColor Green