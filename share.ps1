# Share Daily Todo with a public link (temporary, free, no signup)
# Your PC must stay on while others use the app.

$Port = 3000
$Root = $PSScriptRoot

Write-Host "`n  Daily Todo — Public Share`n" -ForegroundColor Cyan

# Start server if not already running
try {
    $null = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2
    Write-Host "  Server already running on port $Port"
} catch {
    Write-Host "  Starting server..."
    Start-Process -FilePath "python" -ArgumentList "server/app.py" -WorkingDirectory $Root -WindowStyle Minimized
    Start-Sleep -Seconds 3
}

$Cloudflared = @(
    "${env:ProgramFiles}\Cloudflare\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Cloudflared) {
    Write-Host "  cloudflared not found. Install: winget install Cloudflare.cloudflared" -ForegroundColor Red
    exit 1
}

Write-Host "  Opening public tunnel...`n" -ForegroundColor Yellow
Write-Host "  Copy the https://....trycloudflare.com link and share it.`n"
Write-Host "  Press Ctrl+C to stop.`n"

& $Cloudflared tunnel --url "http://localhost:$Port"
