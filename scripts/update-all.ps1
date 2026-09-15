# Full Maw3ed update + smoke + mobile (PowerShell)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
node scripts/update-targets.js all @args
exit $LASTEXITCODE
