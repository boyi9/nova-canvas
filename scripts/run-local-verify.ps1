<# 
.SYNOPSIS
    Local verification runner matching the CLI interface for Nova Canvas
.DESCRIPTION
    Runs the verify-local-env.sh script with retry logic and optional board sync
.EXAMPLE
    .\run-local-verify.ps1 -Script ".\scripts\verify-local-env.sh" -Runner "local-gpu-runner" -AutoRetry 3 -SyncBoard $true
#>

param(
    [string]$Script = ".\scripts\verify-local-env.sh",
    [string]$Runner = "local-gpu-runner",
    [int]$AutoRetry = 3,
    [bool]$SyncBoard = $true
)

Write-Host "=== run-local-verify ===" -ForegroundColor Cyan
Write-Host "Script: $Script"
Write-Host "Runner: $Runner"
Write-Host "Auto-retry: $AutoRetry"
Write-Host "Sync-board: $SyncBoard"
Write-Host ""

# Check if script exists
if (-not (Test-Path $Script)) {
    Write-Host "❌ Script not found: $Script" -ForegroundColor Red
    Write-Host "Available scripts:"
    Get-ChildItem scripts/
    exit 1
}

# Run with retry logic
$attempt = 1
$success = $false

while ($attempt -le $AutoRetry) {
    Write-Host "🔄 Attempt $attempt/$AutoRetry..." -ForegroundColor Yellow
    
    # Run the bash script (requires WSL or Git Bash)
    $exitCode = 0
    try {
        # Try running via WSL first
        if (Get-Command wsl -ErrorAction SilentlyContinue) {
            & wsl bash $Script
            $exitCode = $LASTEXITCODE
        }
        elseif (Get-Command bash -ErrorAction SilentlyContinue) {
            & bash $Script
            $exitCode = $LASTEXITCODE
        }
        else {
            Write-Host "❌ No bash/WSL found. Please run in WSL or Git Bash." -ForegroundColor Red
            exit 1
        }
    }
    catch {
        $exitCode = 1
    }
    
    if ($exitCode -eq 0) {
        Write-Host "✅ Verification passed on attempt $attempt" -ForegroundColor Green
        $success = $true
        break
    }
    else {
        Write-Host "❌ Attempt $attempt failed (exit code: $exitCode)" -ForegroundColor Red
        if ($attempt -eq $AutoRetry) {
            Write-Host "💥 All $AutoRetry attempts exhausted" -ForegroundColor Red
            exit 1
        }
        Write-Host "⏳ Waiting 10s before retry..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        $attempt++
    }
}

# Sync board if requested
if ($SyncBoard) {
    Write-Host "📋 Syncing board status..." -ForegroundColor Cyan
    $tasks = @(
        "S1-W1-D1-INFRA-001-V01",
        "S1-W1-D1-INFRA-001-V02", 
        "S1-W1-D1-INFRA-001-V03",
        "S1-W1-D1-INFRA-001-V04"
    )
    foreach ($task in $tasks) {
        Write-Host "  → Marking $task as DONE in board-import CSVs"
        # In real implementation: call /sync-board or update CSVs directly
    }
    Write-Host "✅ Board sync complete (simulated)" -ForegroundColor Green
}

Write-Host "🎉 run-local-verify completed successfully" -ForegroundColor Green