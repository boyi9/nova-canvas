# Safe infinite -> nova rebranding script (UTF-8 safe via .NET APIs)
# Preserves qualified MIT upstream references; replaces everything else.
param(
    [string]$Root = "D:\nova启画\novacanvas"
)

$ErrorActionPreference = "Stop"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8Bom   = New-Object System.Text.UTF8Encoding($true)

# Upstream-qualified strings to PRESERVE (MIT upstream)
$upstreamPatterns = @(
    'basketikun/infinite-canvas',
    'github.com/basketikun/infinite-canvas',
    'github.com/infinite-canvas',
    'ghcr.io/basketikun/infinite-canvas',
    '@infinite-canvas/'
)

$ph = '___UPSTREAM_INFINITE_PRESERVE___'
$excludeDirs = @('node_modules', '.git', 'dist', '.coverage', 'coverage')

$files = Get-ChildItem -Path $Root -Recurse -File -Include "*.md","*.mdx","*.json","*.jsonc","*.yml","*.yaml","*.go","*.ts","*.tsx","*.ps1","*.txt","*.py" 

$totalChanged = 0
foreach ($f in $files) {
    $path = $f.FullName
    $dir = $f.DirectoryName
    $skip = $false
    foreach ($ex in $excludeDirs) {
        if ($dir -like "*\$ex" -or $dir -like "*\$ex\*") { $skip = $true; break }
    }
    if ($skip) { continue }
    if ($f.Name -eq 'rebrand-infinite-to-nova.ps1') { continue }
    if ($f.FullName -eq (Join-Path $Root 'README.md')) { continue }

    try {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        # Decode as UTF-8; if it's mostly binary, skip
        $content = $utf8NoBom.GetString($bytes)
        if ($content -match '[^\x09\x0A\x0D\x20-\x7E]') {
            # Contains non-ASCII (Chinese etc.) -> use UTF8 decode which is fine
        }
        # Heuristic: if many NUL bytes, treat as binary and skip
        $nulCount = ([regex]'\x00').Matches($content).Count
        if ($nulCount -gt 0) { continue }

        $original = $content

        foreach ($up in $upstreamPatterns) { $content = $content.Replace($up, $ph) }
        # Case-aware variants of the product name
        $content = $content.Replace('InfiniteCanvas', 'NovaCanvas')
        $content = $content.Replace('Infinite-Canvas', 'Nova-Canvas')
        $content = $content.Replace('Infinite Canvas', 'Nova Canvas')
        $content = $content.Replace('Infinite canvas', 'Nova canvas')
        $content = $content.Replace('INFINITE_CANVAS', 'NOVA_CANVAS')
        $content = $content.Replace('infinite-canvas', 'nova-canvas')
        $content = $content.Replace('infinitecanvas', 'novacanvas')
        $content = $content.Replace('novainfinite', 'novacanvas')
        $content = $content.Replace('infinite', 'nova')
        foreach ($up in $upstreamPatterns) { $content = $content.Replace($ph, $up) }

        if ($content -ne $original) {
            [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
            Write-Host "UPDATED: $path" -ForegroundColor Green
            $totalChanged++
        }
    } catch {
        Write-Host "SKIP (error): $path - $_" -ForegroundColor Yellow
    }
}

Write-Host "`nTotal files updated: $totalChanged" -ForegroundColor Cyan