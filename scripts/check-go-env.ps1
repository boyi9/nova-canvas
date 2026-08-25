# INFRA-001-V03: Go Environment and Hello World Validation
# Acceptance Criteria: Go environment loads | Hello World code runs correctly | No compile errors

$ErrorActionPreference = "Stop"
$startTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
Write-Host "=== INFRA-001-V03: Go Environment Validation ===" -ForegroundColor Cyan
Write-Host "Start: $startTime" -ForegroundColor Gray

# 1. Verify Go environment
Write-Host "`n[1/3] Verifying Go environment..." -ForegroundColor Yellow
try {
    $goVersion = & go version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Go version check failed" }
    Write-Host "  PASS: $goVersion" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: Go environment verification failed: $_" -ForegroundColor Red
    exit 1
}

# 2. Generate Hello World code
Write-Host "`n[2/3] Generating Hello World code..." -ForegroundColor Yellow
$helloWorldDir = Join-Path $PSScriptRoot "hello-world"
if (-not (Test-Path $helloWorldDir)) {
    New-Item -ItemType Directory -Path $helloWorldDir -Force | Out-Null
}

$helloWorldGo = @"
package main

import "fmt"

func main() {
    fmt.Println("Hello, Nova Canvas!")
}
"@

$helloWorldGo | Out-File -FilePath (Join-Path $helloWorldDir "main.go") -Encoding UTF8
Write-Host "  PASS: main.go generated" -ForegroundColor Green

# 3. Compile and run
Write-Host "`n[3/3] Compiling and running Hello World..." -ForegroundColor Yellow
Push-Location $helloWorldDir
try {
    # Initialize Go module
    $ErrorActionPreferenceOld = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    go mod init hello-world 2>&1 | Out-Null
    
    # Compile
    $compileStart = Get-Date
    go build -o hello.exe . 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Go build failed" }
    $compileEnd = Get-Date
    $compileTime = ($compileEnd - $compileStart).TotalMilliseconds
    Write-Host "  PASS: Compile successful (${compileTime}ms)" -ForegroundColor Green
    
    # Run
    $runStart = Get-Date
    $output = & .\hello.exe 2>&1
    $runEnd = Get-Date
    $runTime = ($runEnd - $runStart).TotalMilliseconds
    Write-Host "  PASS: Run successful (${runTime}ms)" -ForegroundColor Green
    Write-Host "  Output: $output" -ForegroundColor White
    
    # Verify output
    if ($output -ne "Hello, Nova Canvas!") {
        Write-Host "  FAIL: Output incorrect" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PASS: Output verified" -ForegroundColor Green
    $ErrorActionPreference = $ErrorActionPreferenceOld
} catch {
    Write-Host "  FAIL: Compile/run failed: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

Remove-Item -Path $helloWorldDir -Recurse -Force -ErrorAction SilentlyContinue

$endTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$totalTime = ((Get-Date $endTime) - (Get-Date $startTime)).TotalSeconds

Write-Host "`n=== Validation Complete ===" -ForegroundColor Cyan
Write-Host "End: $endTime" -ForegroundColor Gray
Write-Host "Duration: ${totalTime}s" -ForegroundColor Gray
Write-Host "Status: PASS" -ForegroundColor Green