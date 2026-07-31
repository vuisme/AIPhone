$ErrorActionPreference = 'Stop'
$studioDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $studioDirectory 'compose.yml'
$pidFile = Join-Path $studioDirectory '.runtime\bridge.pid'

docker compose -f $composeFile down
$composeFailed = $LASTEXITCODE -ne 0

if (Test-Path -LiteralPath $pidFile) {
    try {
        $state = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
        $process = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$state.startTimeUtcTicks) {
            Stop-Process -Id $process.Id -Force
        }
    } catch {
        Write-Warning 'The saved USB bridge state was invalid; no process was stopped.'
    }
    Remove-Item -LiteralPath $pidFile -Force
}

if ($composeFailed) { throw 'Unable to stop the Studio container; the USB bridge was still cleaned up.' }
Write-Host 'AIPhone Studio has stopped.'
