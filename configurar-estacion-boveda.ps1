param([string]$ServerUrl, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'

if (-not $ServerUrl) { $ServerUrl = Read-Host 'Escribe la URL del servidor (ejemplo: http://192.168.10.141:4000)' }
$ServerUrl = $ServerUrl.Trim().TrimEnd('/')
if ($ServerUrl.EndsWith('/api')) { $ServerUrl = $ServerUrl.Substring(0, $ServerUrl.Length - 4) }
if ($ServerUrl -notmatch '^https?://[^/]+(?::\d+)?$') { throw 'La URL no es válida. Usa, por ejemplo: http://192.168.10.141:4000' }

$health = Invoke-RestMethod -Uri "$ServerUrl/api/health/ready" -TimeoutSec 5
if ($health.status -ne 'ready') { throw 'El servidor respondió, pero no está listo.' }

$configDirectory = Join-Path $env:LOCALAPPDATA 'Boveda-NTZ'
$configFile = Join-Path $configDirectory 'station.json'
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
@{ serverUrl = $ServerUrl } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
[Environment]::SetEnvironmentVariable('BOVEDA_SERVER_URL', $ServerUrl, 'User')

Write-Host "Estación configurada para usar $ServerUrl" -ForegroundColor Green
Write-Host "Health: $($health.status) - PostgreSQL: $($health.checks.database) - PDF: $($health.checks.storage) - OCR: $($health.checks.ocrWorker)"
Write-Host 'Cierra y vuelve a abrir Bóveda-NTZ para aplicar la configuración.'
if (-not $NonInteractive) { Read-Host 'Presiona Enter para cerrar' }
