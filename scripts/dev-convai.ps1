# Avvia stack ConvAI locale: gateway :3110 (Omnia :3100), Vite da VITE_DEV_PORT (default 5180)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Read-DotEnvValue {
    param([string]$Key)
    foreach ($file in @('backend\.env', '.env', '.env.local')) {
        $path = Join-Path $ProjectRoot $file
        if (-not (Test-Path $path)) { continue }
        $line = Get-Content $path | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
        if ($line) {
            return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$GatewayPort = Read-DotEnvValue 'CONVAI_GATEWAY_PORT'
if (-not $GatewayPort) { $GatewayPort = '3110' }

$VitePort = Read-DotEnvValue 'VITE_DEV_PORT'
if (-not $VitePort) { $VitePort = '5180' }
if ($GatewayPort -eq '3100') {
    Write-Host "ERRORE: CONVAI_GATEWAY_PORT=3100 conflitto con Omnia Express. Usa 3110 in backend/.env." -ForegroundColor Red
    exit 1
}

$GatewayHost = '127.0.0.1'
$GatewayUrl = "http://${GatewayHost}:$GatewayPort"
$HealthUrl = "$GatewayUrl/health"
$NgrokStartUrl = "$GatewayUrl/api/dev-tunnel/ngrok/start"

function Get-GatewayHealth {
    try {
        return Invoke-RestMethod -Uri $HealthUrl -Method GET -TimeoutSec 3
    } catch {
        return $null
    }
}

function Test-GatewayHealth {
    return $null -ne (Get-GatewayHealth)
}

function Test-GatewayHasToolsRoutes {
    $health = Get-GatewayHealth
    if ($null -eq $health) { return $false }
    if ($health.capabilities -contains 'elevenlabs-tools') { return $true }

    # Gateway legacy: Express 404 e immediato; il proxy ElevenLabs e lento (>5s).
    try {
        $response = Invoke-WebRequest -Uri "$GatewayUrl/elevenlabs/tools" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ne 404
    } catch {
        $webResponse = $_.Exception.Response
        if ($null -ne $webResponse -and $null -ne $webResponse.StatusCode) {
            return ([int]$webResponse.StatusCode) -ne 404
        }
        return $true
    }
}

function Wait-Gateway {
    param([int]$MaxSeconds = 45)
    for ($i = 0; $i -lt $MaxSeconds; $i++) {
        if (Test-GatewayHasToolsRoutes) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Wait-Vite {
    param([int]$MaxSeconds = 45)
    $viteUrl = "http://127.0.0.1:$VitePort/"
    for ($i = 0; $i -lt $MaxSeconds; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $viteUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            # Vite still starting
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host ""
Write-Host "=== ConvAI dev stack ===" -ForegroundColor Cyan
Write-Host "Progetto: $ProjectRoot"
Write-Host "Gateway port: $GatewayPort (Omnia Express resta su :3100)"
Write-Host "Frontend port: $VitePort (Omnia Vite tipicamente :5173)"
Write-Host ""

$elevenKey = Read-DotEnvValue 'ELEVENLABS_API_KEY'
if (-not $elevenKey) {
    Write-Host "WARN: ELEVENLABS_API_KEY mancante in .env" -ForegroundColor Yellow
}

$ngrokToken = Read-DotEnvValue 'NGROK_AUTHTOKEN'
if (-not $ngrokToken) {
    Write-Host "WARN: NGROK_AUTHTOKEN mancante in .env" -ForegroundColor Yellow
}

$gatewayCmd = 'npm run be:gateway'
$viteCmd = 'npm run dev'

function Free-TcpPort {
    param([int]$Port)
    Write-Host "Libero porta $Port (eventuale Vite precedente)..." -ForegroundColor Cyan
    $tsxCli = Join-Path $ProjectRoot 'node_modules\.bin\tsx.cmd'
    if (-not (Test-Path $tsxCli)) {
        throw "tsx non trovato. Esegui npm install nella root del progetto."
    }
    $ensureScript = Join-Path $ProjectRoot 'scripts\ensurePortFree.ts'
    & $tsxCli $ensureScript $Port
    if ($LASTEXITCODE -ne 0) {
        throw "ensurePortFree fallito sulla porta $Port."
    }
}

$gatewayNeedsStart = $false
if (Test-GatewayHealth) {
    if (Test-GatewayHasToolsRoutes) {
        Write-Host "Gateway gia attivo su $GatewayUrl" -ForegroundColor Green
    } else {
        Write-Host "Gateway obsoleto su $GatewayUrl (mancano route /elevenlabs/tools): riavvio..." -ForegroundColor Yellow
        Free-TcpPort -Port ([int]$GatewayPort)
        $gatewayNeedsStart = $true
    }
} else {
    $gatewayNeedsStart = $true
}

if ($gatewayNeedsStart) {
    Write-Host "Avvio gateway in nuova finestra..." -ForegroundColor Cyan
    Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit', '-Command', $gatewayCmd | Out-Null

    Write-Host "Attendo gateway su $HealthUrl ..."
    if (-not (Wait-Gateway)) {
        throw "Gateway non pronto su $HealthUrl entro 45s. Controlla la finestra PowerShell be:gateway."
    }
    Write-Host "Gateway OK" -ForegroundColor Green
}

$publicTunnelUrl = $null
if ($ngrokToken) {
    try {
        $status = Invoke-RestMethod -Uri "$GatewayUrl/api/dev-tunnel/ngrok/status" -Method GET -TimeoutSec 20
        $tunnel = $status.tunnels."$GatewayPort"
        $needsStart = -not ($tunnel.running -and $tunnel.publicUrl -and $tunnel.reachable)
        if (-not $needsStart) {
            $publicTunnelUrl = $tunnel.publicUrl
            Write-Host "Tunnel ngrok attivo e raggiungibile: $publicTunnelUrl" -ForegroundColor Green
        } else {
            if ($tunnel.running -and $tunnel.publicUrl -and -not $tunnel.reachable) {
                Write-Host "Tunnel ngrok stale (offline su internet): $($tunnel.publicUrl)" -ForegroundColor Yellow
                Write-Host "Riavvio tunnel ngrok su porta $GatewayPort ..."
            } else {
                Write-Host "Avvio tunnel ngrok su porta $GatewayPort ..."
            }
            $body = @{ ports = @([int]$GatewayPort) } | ConvertTo-Json -Compress
            $started = Invoke-RestMethod -Uri $NgrokStartUrl -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 90
            $publicTunnelUrl = $started.tunnels."$GatewayPort".publicUrl
            if ($publicTunnelUrl) {
                Write-Host "Tunnel ngrok: $publicTunnelUrl" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "WARN: ngrok non avviato: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "      Riavvia il gateway (chiudi la finestra be:gateway e rilancia npm run dev:convai)." -ForegroundColor Yellow
    }
}

Write-Host ""
Free-TcpPort -Port ([int]$VitePort)
Write-Host "Avvio frontend Vite in nuova finestra..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit', '-Command', $viteCmd | Out-Null

Write-Host "Attendo Vite su http://127.0.0.1:$VitePort/ ..."
if (-not (Wait-Vite)) {
    throw "Frontend non risponde su http://127.0.0.1:$VitePort/ entro 45s. Controlla la finestra PowerShell di Vite per errori."
}
Write-Host "Frontend OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== Stack avviato ===" -ForegroundColor Green
Write-Host "  Frontend:  http://127.0.0.1:$VitePort"
Write-Host "  Gateway:   $GatewayUrl"
if ($publicTunnelUrl) {
    Write-Host "  Webhook:   $publicTunnelUrl/api/runtime/agent-dialog-step/<documentId>"
} else {
    Write-Host "  Webhook:   solo locale (avvia ngrok per deploy ConvAI)"
}
Write-Host ""
Write-Host "Chiudi le finestre PowerShell del gateway e di Vite per fermare i servizi." -ForegroundColor DarkGray
Write-Host ""
