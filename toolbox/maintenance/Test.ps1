param([string]$Suite = 'default', [switch]$List, [switch]$All)
. (Join-Path $PSScriptRoot '_common.ps1')

if ($All) { $Suite = 'all' }

Write-MaintenanceHeader 'Project tests'
$tests = $script:MaintenanceConfig.tests
$available = @($tests.PSObject.Properties | ForEach-Object { $_.Name })

if ($List) {
    if ($available.Count -eq 0) { Write-Host 'No automated test suites are configured.'; exit 0 }
    $available | ForEach-Object {
        $entry = $tests.PSObject.Properties[$_].Value
        Write-Host "  $_ => $($entry.script)"
    }
    exit 0
}

if ($available.Count -eq 0) {
    Write-Host '[SKIP] This project has no automated test script configured.' -ForegroundColor Yellow
    exit 0
}

if ($Suite -eq 'default' -and $tests.PSObject.Properties.Name -notcontains 'default') {
    if ($available.Count -gt 0) { $Suite = 'all' }
    else {
        Write-Host '[SKIP] No automated test suites are configured.' -ForegroundColor Yellow
        exit 0
    }
}
if ($Suite -eq 'all') {
    $selected = $available
}
elseif ($tests.PSObject.Properties.Name -contains $Suite) {
    $selected = @($Suite)
}
else {
    Write-Host "Unknown test suite '$Suite'. Available: $($available -join ', '), all" -ForegroundColor Red
    exit 2
}

$failures = [System.Collections.Generic.List[string]]::new()
foreach ($name in $selected) {
    $test = $tests.$name
    $label = if ($test.name) { [string]$test.name } else { $name }
    $code = Invoke-ConfiguredScript -Name ([string]$test.script) -Target ([string]$test.target)
    if ($code -ne 0) { $failures.Add("$label (exit $code)") }
}

if ($failures.Count -gt 0) {
    Write-Host "[FAILED] $($failures -join '; ')" -ForegroundColor Red
    exit 1
}
Write-Host '[OK] Selected test suites passed.' -ForegroundColor Green
