param(
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$studioDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryDirectory = Split-Path -Parent $studioDirectory
$composeFile = Join-Path $studioDirectory 'compose.yml'
$runtimeDirectory = Join-Path $studioDirectory '.runtime'
$pidFile = Join-Path $runtimeDirectory 'bridge.pid'
$stdoutLog = Join-Path $runtimeDirectory 'bridge.out.log'
$stderrLog = Join-Path $runtimeDirectory 'bridge.err.log'
$bridgeStarted = $false

function Require-Command([string]$name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $command) { throw "$name is required." }
    return $command.Source
}

function Get-BridgeProcess {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    try {
        $state = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
        $process = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
        if (-not $process) { return $null }
        if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$state.startTimeUtcTicks) { return $null }
        return $process
    } catch {
        return $null
    }
}

function Test-BridgeProcess {
    return $null -ne (Get-BridgeProcess)
}

function Wait-ForHealth([string]$url, [string]$expectedMode, [int]$attempts = 20) {
    foreach ($attempt in 1..$attempts) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
            $body = $response.Content | ConvertFrom-Json
            if ($response.StatusCode -eq 200 -and $body.mode -eq $expectedMode) { return }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Service did not become healthy: $url"
}

$node = Require-Command 'node'
Require-Command 'docker' | Out-Null
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
if (-not (Test-BridgeProcess)) {
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
    $bundledAdb = Join-Path $repositoryDirectory 'adb-tool\adb.exe'
    if (Test-Path -LiteralPath $bundledAdb) { $env:AIPHONE_ADB = $bundledAdb }
    $bridgeScript = Join-Path $studioDirectory 'host\server.mjs'
    $bridge = Start-Process -FilePath $node `
        -ArgumentList @("`"$bridgeScript`"", '--bridge-only', '--port=4174') `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
    $state = @{
        processId = $bridge.Id
        startTimeUtcTicks = $bridge.StartTime.ToUniversalTime().Ticks.ToString()
    }
    Set-Content -LiteralPath $pidFile -Value ($state | ConvertTo-Json -Compress) -NoNewline
    $bridgeStarted = $true
}

try {
    Wait-ForHealth 'http://127.0.0.1:4174/healthz' 'bridge'
    if ($Build) {
        docker compose -f $composeFile build
    } else {
        docker compose -f $composeFile pull
    }
    if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare the Studio image.' }
    docker compose -f $composeFile up -d --no-build
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start the Studio container.' }
    Wait-ForHealth 'http://127.0.0.1:4173/healthz' 'static'
    Start-Process 'http://127.0.0.1:4173'
    Write-Host 'AIPhone Studio is running at http://127.0.0.1:4173'
} catch {
    $bridgeProcess = Get-BridgeProcess
    if ($bridgeStarted -and $bridgeProcess) {
        Stop-Process -Id $bridgeProcess.Id -Force
        Remove-Item -LiteralPath $pidFile -Force
    }
    throw
}
