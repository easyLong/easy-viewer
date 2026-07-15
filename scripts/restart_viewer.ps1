param(
  [string]$HostName = "0.0.0.0",
  [int]$Port = 8898
)

$ErrorActionPreference = "Stop"

& "$PSScriptRoot\start_viewer_prod.ps1" -HostName $HostName -Port $Port -Background -Restart -ClearProxy $true
