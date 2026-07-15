param(
  [string]$HostName = "0.0.0.0",
  [int]$Port = 8898,
  [switch]$Background,
  [switch]$Restart,
  [bool]$ClearProxy = $true
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$LogDir = Join-Path $Root ".tmp"
$OutLog = Join-Path $LogDir "easy-viewer.out.log"
$ErrLog = Join-Path $LogDir "easy-viewer.err.log"
$PidFile = Join-Path $LogDir "easy-viewer.pid"

Set-Location $Root
New-Item -ItemType Directory -Force $LogDir | Out-Null

if ($ClearProxy) {
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy" | ForEach-Object {
    Remove-Item "Env:\$_" -ErrorAction SilentlyContinue
  }
  Write-Host "Proxy env cleared for this startup."
}

if ($Restart) {
  if (Test-Path $PidFile) {
    $OldPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($OldPid -and (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $OldPid -Force
      Write-Host "Stopped previous PID: $OldPid"
    }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
  }
  $Listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($Listener in $Listeners) {
    if ($Listener.OwningProcess -and (Get-Process -Id $Listener.OwningProcess -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $Listener.OwningProcess -Force
      Write-Host "Stopped process on port ${Port}: $($Listener.OwningProcess)"
    }
  }
}

if (-not (Test-Path $VenvPython)) {
  python -m venv .venv
}

& $VenvPython -m pip install -e .

$env:PYTHONPATH = $Root
$Args = @(
  "-m", "uvicorn",
  "post_viewer.api:app",
  "--host", $HostName,
  "--port", "$Port"
)

if ($Background) {
  $Process = Start-Process `
    -FilePath $VenvPython `
    -ArgumentList $Args `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -Path $PidFile -Value $Process.Id
  Write-Host "easy-viewer started: http://${HostName}:$Port"
  Write-Host "PID: $($Process.Id)"
  Write-Host "PID file: $PidFile"
  Write-Host "Logs: $OutLog / $ErrLog"
} else {
  & $VenvPython @Args
}
