param(
  [int]$Port = 8898,
  [string]$AppHost = "127.0.0.1",
  [string]$CloudflaredPath = "",
  [switch]$SkipAppStart
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ToolDir = Join-Path $Root ".tools"
$CloudflaredExe = if ($CloudflaredPath) { $CloudflaredPath } else { Join-Path $ToolDir "cloudflared.exe" }

Set-Location $Root
New-Item -ItemType Directory -Force $ToolDir | Out-Null

if (-not (Test-Path $CloudflaredExe)) {
  Write-Host "Downloading cloudflared..."
  $Url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Invoke-WebRequest -Uri $Url -OutFile $CloudflaredExe
}

if (-not $SkipAppStart) {
  Write-Host "Starting easy-viewer on http://${AppHost}:$Port ..."
  powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start_viewer_prod.ps1") -HostName $AppHost -Port $Port -Background
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Opening Cloudflare quick tunnel..."
Write-Host "Keep this window open. Copy the https://*.trycloudflare.com URL shown below."
Write-Host ""

& $CloudflaredExe tunnel --url "http://${AppHost}:$Port"
