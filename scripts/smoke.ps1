Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Run-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Title,

        [Parameter(Mandatory = $true)]
        [string] $Command,

        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    Write-Host ""
    Write-Host "=== $Title ==="
    Write-Host "Running: $Command $($Arguments -join ' ')"

    & $Command @Arguments

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Step '$Title' failed with exit code $LASTEXITCODE." -ForegroundColor Red
        Exit $LASTEXITCODE
    }
}

Run-Step -Title "Web build" -Command "npm" -Arguments @("-w", "apps/web", "run", "build")
Run-Step -Title "API build" -Command "npm" -Arguments @("-w", "apps/api", "run", "build")

Write-Host ""
Write-Host "Smoke check completed successfully."
