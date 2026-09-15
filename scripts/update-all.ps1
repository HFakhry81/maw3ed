# Full Maw3ed update + smoke tests (PowerShell)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
node scripts/refresh-all.js @args
exit $LASTEXITCODE
