param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8898,
  [switch]$Background
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$LogDir = Join-Path $Root ".tmp"
$OutLog = Join-Path $LogDir "easy-viewer.out.log"
$ErrLog = Join-Path $LogDir "easy-viewer.err.log"

Set-Location $Root
New-Item -ItemType Directory -Force $LogDir | Out-Null

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
  Write-Host "easy-viewer started: http://${HostName}:$Port"
  Write-Host "PID: $($Process.Id)"
  Write-Host "Logs: $OutLog / $ErrLog"
} else {
  & $VenvPython @Args
}
