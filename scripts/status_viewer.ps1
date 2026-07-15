param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8898
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root ".tmp\easy-viewer.pid"

if (Test-Path $PidFile) {
  $ViewerPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($ViewerPid -and (Get-Process -Id $ViewerPid -ErrorAction SilentlyContinue)) {
    Write-Host "Status: running"
    Write-Host "PID: $ViewerPid"
  } else {
    Write-Host "Status: stopped"
    Write-Host "Recorded PID: $ViewerPid"
  }
} else {
  Write-Host "PID file: missing"
}

$Listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Listeners) {
  Write-Host "Port ${Port}: listening"
  $Listeners | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
} else {
  Write-Host "Port ${Port}: not listening"
}

try {
  $Response = Invoke-WebRequest -Uri "http://${HostName}:$Port/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Health: HTTP $($Response.StatusCode)"
  Write-Host $Response.Content
} catch {
  Write-Host "Health: failed - $($_.Exception.Message)"
}
