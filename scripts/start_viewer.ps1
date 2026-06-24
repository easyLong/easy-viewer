$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$env:PYTHONPATH = $Root

python -m uvicorn post_viewer.api:app --host 127.0.0.1 --port 8898 --reload
