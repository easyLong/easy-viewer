param(
  [int]$Port = 8898
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root ".tmp\easy-viewer.pid"

$Stopped = $false
if (Test-Path $PidFile) {
  $ViewerPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($ViewerPid -and (Get-Process -Id $ViewerPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $ViewerPid -Force
    Write-Host "Stopped easy-viewer PID: $ViewerPid"
    $Stopped = $true
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}

$Listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($Listener in $Listeners) {
  if ($Listener.OwningProcess -and (Get-Process -Id $Listener.OwningProcess -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $Listener.OwningProcess -Force
    Write-Host "Stopped process on port ${Port}: $($Listener.OwningProcess)"
    $Stopped = $true
  }
}

if (-not $Stopped) {
  Write-Host "easy-viewer is not running."
}
