$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:MaintenanceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:MaintenanceConfigPath = Join-Path $PSScriptRoot 'project.json'
$script:MaintenancePackagePath = Join-Path $script:MaintenanceRoot 'package.json'

if (-not (Test-Path -LiteralPath $script:MaintenancePackagePath)) {
    throw "Project package.json was not found at $script:MaintenanceRoot"
}
if (-not (Test-Path -LiteralPath $script:MaintenanceConfigPath)) {
    throw "Maintenance config was not found at $script:MaintenanceConfigPath"
}

$script:MaintenanceConfig = Get-Content -LiteralPath $script:MaintenanceConfigPath -Raw | ConvertFrom-Json
$script:MaintenancePackage = Get-Content -LiteralPath $script:MaintenancePackagePath -Raw | ConvertFrom-Json
$script:MaintenanceManager = [string]$script:MaintenanceConfig.packageManager

if ($script:MaintenanceManager -notin @('pnpm', 'npm', 'yarn')) {
    throw "Unsupported packageManager '$($script:MaintenanceManager)' in $script:MaintenanceConfigPath"
}

function Write-MaintenanceHeader([string]$Title) {
    Write-Host ''
    Write-Host "[$($script:MaintenanceConfig.project)] $Title" -ForegroundColor Cyan
    Write-Host "Project: $script:MaintenanceRoot"
}

function Get-RootScriptNames {
    if (-not $script:MaintenancePackage.scripts) { return @() }
    return @($script:MaintenancePackage.scripts.PSObject.Properties.Name)
}

function Invoke-ConfiguredScript {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$Target
    )

    if (-not $Target -and $Name -notin (Get-RootScriptNames)) {
        Write-Host "[ERROR] Root script '$Name' is not declared in package.json." -ForegroundColor Red
        return 127
    }

    Write-Host "[RUN] $($script:MaintenanceManager) $Name" -ForegroundColor Gray
    Push-Location -LiteralPath $script:MaintenanceRoot
    try {
        switch ($script:MaintenanceManager) {
            'pnpm' {
                if ($Target) { & pnpm --filter $Target run $Name | Out-Host }
                else { & pnpm run $Name | Out-Host }
            }
            'npm' {
                if ($Target) { throw 'Targeted workspace scripts require pnpm.' }
                & npm run $Name | Out-Host
            }
            'yarn' {
                if ($Target) { throw 'Targeted workspace scripts require pnpm.' }
                & yarn run $Name | Out-Host
            }
        }
        $status = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($null -eq $status) { $status = 0 }
    return [int]$status
}

function Invoke-SecurityAudit {
    Write-Host "[RUN] $($script:MaintenanceManager) audit" -ForegroundColor Gray
    $previousSystemCa = $env:NODE_USE_SYSTEM_CA
    $env:NODE_USE_SYSTEM_CA = '1'
    Push-Location -LiteralPath $script:MaintenanceRoot
    try {
        switch ($script:MaintenanceManager) {
            'pnpm' { & pnpm audit --recursive | Out-Host }
            'npm' {
                $cache = Join-Path (Join-Path 'E:\Installments' $script:MaintenanceConfig.installDirectory) 'npm-cache'
                & npm audit --cache $cache | Out-Host
            }
            'yarn' { & yarn audit | Out-Host }
        }
        $status = $LASTEXITCODE
    }
    finally {
        Pop-Location
        if ($null -eq $previousSystemCa) { Remove-Item Env:NODE_USE_SYSTEM_CA -ErrorAction SilentlyContinue }
        else { $env:NODE_USE_SYSTEM_CA = $previousSystemCa }
    }
    if ($null -eq $status) { $status = 0 }
    return [int]$status
}
