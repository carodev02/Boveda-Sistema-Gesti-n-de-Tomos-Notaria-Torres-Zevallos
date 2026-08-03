param([switch]$NonInteractive)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$dumpFile=Join-Path $projectRoot 'migracion\sigadn.dump'
$sourceStorage=Join-Path $projectRoot 'migracion\storage'
$targetStorage=Join-Path $projectRoot 'backend\storage'
$dockerEnv=Join-Path $projectRoot 'servidor-docker.env'
$composeFile=Join-Path $projectRoot 'docker-compose.yml'

if(-not (Test-Path -LiteralPath $dumpFile -PathType Leaf)){throw 'No se encontró migracion\sigadn.dump.'}
if(-not (Test-Path -LiteralPath $sourceStorage -PathType Container)){throw 'No se encontró migracion\storage.'}
if(-not (Test-Path -LiteralPath $dockerEnv -PathType Leaf)){throw 'No se encontró servidor-docker.env.'}
$databaseStatus=(& docker inspect --format '{{.State.Health.Status}}' sigadn-postgres 2>$null).Trim()
if($databaseStatus -ne 'healthy'){throw 'El contenedor sigadn-postgres no está listo. Ejecuta primero CONFIGURAR-SERVIDOR-DOCKER.bat.'}

$environment=@{}
Get-Content -LiteralPath $dockerEnv | ForEach-Object {
  if($_ -match '^\s*([^#=]+)=(.*)$'){$environment[$matches[1].Trim()]=$matches[2].Trim()}
}
$databaseName=$environment.POSTGRES_DB
$databaseUser=$environment.POSTGRES_USER
if(-not $databaseName -or -not $databaseUser){throw 'POSTGRES_DB y POSTGRES_USER deben existir en servidor-docker.env.'}

if(-not $NonInteractive){
  Write-Host 'Esta operación reemplazará la base de datos del servidor Docker con la copia migrada.' -ForegroundColor Yellow
  $confirmation=Read-Host 'Escribe RESTAURAR para continuar'
  if($confirmation -ne 'RESTAURAR'){throw 'Restauración cancelada.'}
}

Set-Location -LiteralPath $projectRoot
& docker compose --env-file $dockerEnv -f $composeFile stop api
$backupStorage=Join-Path $projectRoot ("respaldo-storage-"+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $targetStorage){Copy-Item -LiteralPath $targetStorage -Destination $backupStorage -Recurse}

& docker cp $dumpFile 'sigadn-postgres:/tmp/sigadn.dump'
if($LASTEXITCODE -ne 0){throw 'No se pudo copiar el respaldo al contenedor.'}
& docker exec sigadn-postgres pg_restore -U $databaseUser -d $databaseName --clean --if-exists --no-owner --no-privileges /tmp/sigadn.dump
if($LASTEXITCODE -ne 0){throw 'No se pudo restaurar PostgreSQL.'}
& docker exec sigadn-postgres rm -f /tmp/sigadn.dump | Out-Null

New-Item -ItemType Directory -Force -Path $targetStorage | Out-Null
Copy-Item -Path (Join-Path $sourceStorage '*') -Destination $targetStorage -Recurse -Force
& docker compose --env-file $dockerEnv -f $composeFile up -d api

$health=$null
for($attempt=1;$attempt -le 40;$attempt++){
  Start-Sleep -Seconds 2
  try{$health=Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/health/ready' -TimeoutSec 2;if($health.status -eq 'ready'){break}}catch{}
}
if(-not $health -or $health.status -ne 'ready'){throw 'Los datos se restauraron, pero el backend no superó el health check.'}
Write-Host 'Base de datos y PDF restaurados correctamente.' -ForegroundColor Green
Write-Host "Respaldo previo del almacenamiento: $backupStorage"
if(-not $NonInteractive){Read-Host 'Presiona Enter para cerrar'}
