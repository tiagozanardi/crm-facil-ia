# Verificação rápida da Evolution API (Windows / PowerShell)
#
# Lê EVOLUTION_API_URL e EVOLUTION_API_KEY do .env do CRM e confere:
#   1. HTTPS e versão no endpoint raiz
#   2. Autenticação e lista de instâncias
#
# Uso:
#   pwsh -File scripts/check-evolution.ps1
#   pwsh -File scripts/check-evolution.ps1 -EnvFile C:\caminho\.env

param(
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
    throw "Arquivo .env não encontrado em $EnvFile"
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

$url = $vars['EVOLUTION_API_URL']
$key = $vars['EVOLUTION_API_KEY']

if (-not $url) { throw "EVOLUTION_API_URL ausente no .env" }
if (-not $key) { throw "EVOLUTION_API_KEY ausente no .env" }

$url = $url.TrimEnd('/')
$masked = if ($key.Length -gt 8) { $key.Substring(0, 4) + '…' + $key.Substring($key.Length - 4) } else { '***' }

Write-Host "URL: $url" -ForegroundColor Cyan
Write-Host "API key: $masked" -ForegroundColor DarkGray

# 1. Endpoint raiz (não exige apikey, confirma HTTPS/TLS e versão)
try {
    $root = Invoke-RestMethod -Uri "$url/" -Method Get -TimeoutSec 25
    Write-Host "OK  raiz: $($root | ConvertTo-Json -Compress -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "FALHA raiz: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Autenticação + instâncias
try {
    $instances = Invoke-RestMethod -Uri "$url/instance/fetchInstances" -Headers @{ apikey = $key } -Method Get -TimeoutSec 25
    $count = @($instances).Count
    Write-Host "OK  autenticação. Instâncias: $count" -ForegroundColor Green
    if ($count -gt 0) {
        @($instances) | ForEach-Object {
            $name = $_.name
            $state = $_.connectionStatus
            Write-Host "    - $name ($state)" -ForegroundColor DarkGray
        }
    }
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
        Write-Host "FALHA autenticação: apikey inválida (401)." -ForegroundColor Red
    } else {
        Write-Host "FALHA instâncias: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Tudo certo." -ForegroundColor Green
