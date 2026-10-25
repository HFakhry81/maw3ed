param([switch]$SkipAudit, [switch]$AuditOnly)
. (Join-Path $PSScriptRoot '_common.ps1')

Write-MaintenanceHeader 'Project checks'
$failures = [System.Collections.Generic.List[string]]::new()

if (-not $AuditOnly) {
    foreach ($check in @($script:MaintenanceConfig.checks)) {
        if (-not $check) { continue }
        $label = if ($check.name) { [string]$check.name } else { [string]$check.script }
        $code = Invoke-ConfiguredScript -Name ([string]$check.script) -Target ([string]$check.target)
        if ($code -ne 0) { $failures.Add("$label (exit $code)") }
    }
}

if (-not $SkipAudit) {
    $code = Invoke-SecurityAudit
    if ($code -ne 0) { $failures.Add("security audit (exit $code)") }
}

if ($failures.Count -gt 0) {
    Write-Host "[FAILED] $($failures -join '; ')" -ForegroundColor Red
    exit 1
}
Write-Host '[OK] All configured checks passed.' -ForegroundColor Green
