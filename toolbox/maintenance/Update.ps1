param([switch]$Upgrade)
. (Join-Path $PSScriptRoot '_common.ps1')

Write-MaintenanceHeader 'Dependency update'
$installRoot = Join-Path 'E:\Installments' $script:MaintenanceConfig.installDirectory
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
$env:NODE_USE_SYSTEM_CA = '1'

Push-Location -LiteralPath $script:MaintenanceRoot
try {
    switch ($script:MaintenanceManager) {
        'pnpm' {
            $store = Join-Path $installRoot 'pnpm-store'
            New-Item -ItemType Directory -Force -Path $store | Out-Null
            if ($Upgrade) {
                Write-Host '[INFO] Updating dependencies within the version ranges in package.json.'
                & pnpm update --recursive --store-dir $store
            }
            else {
                Write-Host '[INFO] Reinstalling the exact versions recorded in pnpm-lock.yaml.'
                & pnpm install --frozen-lockfile --store-dir $store
            }
        }
        'npm' {
            $cache = Join-Path $installRoot 'npm-cache'
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            if ($Upgrade) {
                Write-Host '[INFO] Updating dependencies within the version ranges in package.json.'
                & npm update --cache $cache --no-audit --no-fund
            }
            else {
                if (Test-Path -LiteralPath (Join-Path $script:MaintenanceRoot 'package-lock.json')) {
                    Write-Host '[INFO] Installing exact versions from package-lock.json.'
                    & npm ci --cache $cache --no-audit --no-fund
                }
                else {
                    Write-Host '[INFO] No npm lockfile found; resolving package.json using the E:\Installments cache.'
                    & npm install --cache $cache --no-audit --no-fund
                }
            }
        }
        'yarn' {
            $cache = Join-Path $installRoot 'yarn-cache'
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            if ($Upgrade) { & yarn upgrade --cache-folder $cache }
            else { & yarn install --frozen-lockfile --cache-folder $cache }
        }
    }
    $status = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($status -ne 0) { exit $status }
Write-Host "[OK] Dependency operation completed. Package caches are under $installRoot" -ForegroundColor Green
