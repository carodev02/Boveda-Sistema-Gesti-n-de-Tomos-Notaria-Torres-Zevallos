param([switch]$CheckOnly,[string]$InstallLocation)
$ErrorActionPreference = 'Stop'

$packageDirectory = Join-Path $PSScriptRoot 'actualizacion'
$manifestPath = Join-Path $packageDirectory 'release.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Falta '$manifestPath'. Copia la carpeta completa de actualizacion."
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$clientSource = Join-Path $packageDirectory 'Boveda-NTZ.exe'
if (-not (Test-Path -LiteralPath $clientSource -PathType Leaf)) { throw "Falta '$clientSource'." }
if ((Get-FileHash -LiteralPath $clientSource -Algorithm SHA256).Hash -ne $manifest.executableSha256) {
  throw 'El ejecutable no coincide con el paquete preparado. Vuelve a copiar la entrega completa.'
}
if (Get-Process -Name 'Boveda-NTZ' -ErrorAction SilentlyContinue) {
  throw 'Cierra Boveda y termina la digitalizacion en curso antes de actualizar.'
}

if (-not $InstallLocation) {
  $uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Bóveda - Notaría Torres Zevallos'
  $locations = @(
    (Get-ItemProperty -LiteralPath "HKCU:\$uninstallKey" -ErrorAction SilentlyContinue).InstallLocation
    (Get-ItemProperty -LiteralPath "HKLM:\$uninstallKey" -ErrorAction SilentlyContinue).InstallLocation
    (Join-Path $env:LOCALAPPDATA 'Bóveda - Notaría Torres Zevallos')
  )
  $InstallLocation = $locations | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path ([string]$_).Trim('"') 'Boveda-NTZ.exe') -PathType Leaf) } | Select-Object -First 1
}
if (-not $InstallLocation) { throw 'No se encontro una instalacion de Boveda en esta PC. No se modifico nada.' }
$installLocation = ([string]$InstallLocation).Trim('"')
$clientTarget = Join-Path $installLocation 'Boveda-NTZ.exe'
if (-not (Test-Path -LiteralPath $clientTarget -PathType Leaf)) { throw "Falta '$clientTarget'. No se modifico nada." }

Write-Host "Aplicacion encontrada en: $installLocation" -ForegroundColor Cyan
Write-Host 'La base de datos, los PDF y Docker no se modificaran.' -ForegroundColor Cyan
if ($CheckOnly) { Write-Host 'Comprobacion terminada. No se copio ningun archivo.' -ForegroundColor Green; exit 0 }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$clientBackup = Join-Path $installLocation "Boveda-NTZ.backup-$stamp.exe"
Copy-Item -LiteralPath $clientTarget -Destination $clientBackup -ErrorAction Stop
try {
  Copy-Item -LiteralPath $clientSource -Destination $clientTarget -Force -ErrorAction Stop
  if ((Get-FileHash -LiteralPath $clientTarget -Algorithm SHA256).Hash -ne $manifest.executableSha256) {
    throw 'La verificacion de los archivos copiados fallo.'
  }
} catch {
  Copy-Item -LiteralPath $clientBackup -Destination $clientTarget -Force
  throw "La actualizacion fallo y se restauraron los archivos anteriores. Detalle: $($_.Exception.Message)"
}
Write-Host 'Boveda se actualizo correctamente. Los archivos anteriores quedaron respaldados.' -ForegroundColor Green
