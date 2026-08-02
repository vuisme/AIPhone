param(
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$studioDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryDirectory = Split-Path -Parent $studioDirectory
$composeFile = Join-Path $studioDirectory 'compose.yml'
$tunnelComposeFile = Join-Path $studioDirectory 'compose.tunnel.yml'
$runtimeDirectory = Join-Path $studioDirectory '.runtime'
$secretsFile = Join-Path $runtimeDirectory 'studio.env'
$pidFile = Join-Path $runtimeDirectory 'bridge.pid'
$stdoutLog = Join-Path $runtimeDirectory 'bridge.out.log'
$stderrLog = Join-Path $runtimeDirectory 'bridge.err.log'
$bridgeStarted = $false

function Require-Command([string]$name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $command) { throw "$name is required." }
    return $command.Source
}

function New-Base64UrlSecret([int]$bytes) {
    $buffer = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Initialize-Secrets {
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    if (Test-Path -LiteralPath $secretsFile) { return }
    $lines = @(
        "AIPHONE_POSTGRES_PASSWORD=$(New-Base64UrlSecret 32)",
        "AIPHONE_REDIS_PASSWORD=$(New-Base64UrlSecret 32)",
        "AIPHONE_CREDENTIAL_KEY=$(New-Base64UrlSecret 32)"
    )
    [IO.File]::WriteAllLines($secretsFile, $lines, [Text.UTF8Encoding]::new($false))
}

function Import-Secrets {
    foreach ($line in Get-Content -LiteralPath $secretsFile) {
        if ($line -notmatch '^([A-Z0-9_]+)=(.+)$') { continue }
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
    $env:DATABASE_URL = "postgresql://aiphone:$($env:AIPHONE_POSTGRES_PASSWORD)@127.0.0.1:55432/aiphone"
    $env:REDIS_URL = "redis://:$($env:AIPHONE_REDIS_PASSWORD)@127.0.0.1:56379"
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

function Wait-ForHealth([string]$url, [string]$expectedMode, [int]$attempts = 30) {
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

function Wait-ForContainer([string]$service, [int]$attempts = 40) {
    foreach ($attempt in 1..$attempts) {
        $containerId = docker compose --env-file $secretsFile -f $composeFile -f $tunnelComposeFile ps -q $service
        if ($LASTEXITCODE -eq 0 -and $containerId) {
            $status = docker inspect --format '{{.State.Health.Status}}' $containerId
            if ($LASTEXITCODE -eq 0 -and $status -eq 'healthy') { return }
        }
        Start-Sleep -Milliseconds 750
    }
    throw "Container did not become healthy: $service"
}

$node = Require-Command 'node'
$npm = Require-Command 'npm'
Require-Command 'docker' | Out-Null
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

Initialize-Secrets
Import-Secrets

$hostLock = Join-Path $studioDirectory 'host\package-lock.json'
$hostModules = Join-Path $studioDirectory 'host\node_modules\pg\package.json'
$hostLockMarker = Join-Path $runtimeDirectory 'host-package-lock.sha256'
$hostLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $hostLock).Hash
$installedLockHash = if (Test-Path -LiteralPath $hostLockMarker) { (Get-Content -Raw -LiteralPath $hostLockMarker).Trim() } else { '' }
if (-not (Test-Path -LiteralPath $hostModules) -or $installedLockHash -ne $hostLockHash) {
    & $npm --prefix (Join-Path $studioDirectory 'host') ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'Unable to install USB bridge dependencies.' }
    [IO.File]::WriteAllText($hostLockMarker, $hostLockHash, [Text.UTF8Encoding]::new($false))
}

if ($Build) {
    docker compose --env-file $secretsFile -f $composeFile -f $tunnelComposeFile build studio-cloud
} else {
    docker compose --env-file $secretsFile -f $composeFile -f $tunnelComposeFile pull
}
if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare the Studio services.' }

docker compose --env-file $secretsFile -f $composeFile -f $tunnelComposeFile up -d postgres redis
if ($LASTEXITCODE -ne 0) { throw 'Unable to start PostgreSQL and Redis.' }
Wait-ForContainer 'postgres'
Wait-ForContainer 'redis'

$existingBridge = Get-BridgeProcess
if ($existingBridge) { Stop-Process -Id $existingBridge.Id -Force }
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
[IO.File]::WriteAllText($pidFile, ($state | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
$bridgeStarted = $true

try {
    Wait-ForHealth 'http://127.0.0.1:4174/healthz' 'bridge'
    docker compose --env-file $secretsFile -f $composeFile -f $tunnelComposeFile up -d --no-build studio-cloud
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start the Studio web container.' }
    Wait-ForHealth 'http://127.0.0.1:4175/healthz' 'full'
    Start-Process 'http://127.0.0.1:4175'
    Write-Host 'AIPhone Studio is running at http://127.0.0.1:4175'
} catch {
    $bridgeProcess = Get-BridgeProcess
    if ($bridgeStarted -and $bridgeProcess) {
        Stop-Process -Id $bridgeProcess.Id -Force
        Remove-Item -LiteralPath $pidFile -Force
    }
    throw
}
