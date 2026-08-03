param([switch]$NonInteractive)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Ejecuta este archivo como Administrador.'}

$projectRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerEnv=Join-Path $projectRoot 'servidor-docker.env'
$composeFile=Join-Path $projectRoot 'docker-compose.yml'
if(-not (Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Instala Docker Desktop antes de continuar.'}
if(-not (docker info 2>$null)){throw 'Abre Docker Desktop y espera a que indique que el motor está ejecutándose.'}

function New-RandomSecret{
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
if(-not (Test-Path -LiteralPath $dockerEnv)){
  @('POSTGRES_DB=sigadn','POSTGRES_USER=sigadn',"POSTGRES_PASSWORD=$(New-RandomSecret)",'POSTGRES_PORT=5433',"JWT_SECRET=$(New-RandomSecret)") | Set-Content -LiteralPath $dockerEnv -Encoding ASCII
}
@('documents','temporary','ocr-sessions') | ForEach-Object {New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "backend\storage\$_") | Out-Null}

Set-Location -LiteralPath $projectRoot
Write-Host 'Descargando y construyendo los contenedores. La primera vez puede tardar varios minutos...' -ForegroundColor Yellow
& docker compose --env-file $dockerEnv -f $composeFile up -d --build
if($LASTEXITCODE -ne 0){throw 'No se pudieron construir los servicios Docker.'}

$firewallName='Boveda-NTZ Servidor API'
$firewall=Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue
if($firewall){Remove-NetFirewallRule -DisplayName $firewallName}
New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private -RemoteAddress LocalSubnet | Out-Null

$launcher=Join-Path $projectRoot 'iniciar-servidor-docker.ps1'
$arguments="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" -ProjectRoot `"$projectRoot`""
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $projectRoot
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'Boveda-NTZ Docker' -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description 'PostgreSQL y API central de Bóveda en Docker' -Force | Out-Null

$health=$null
for($attempt=1;$attempt -le 120;$attempt++){
  Start-Sleep -Seconds 2
  try{$health=Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/health/ready' -TimeoutSec 2;if($health.status -eq 'ready'){break}}catch{}
}
if(-not $health -or $health.status -ne 'ready'){
  & docker compose --env-file $dockerEnv -f $composeFile logs --tail 80
  throw 'El servidor no superó el health check.'
}
$lanAddress=Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -and $_.IPv4Address} | ForEach-Object {$_.IPv4Address.IPAddress} | Select-Object -First 1
Write-Host ''
Write-Host 'Servidor central Docker configurado correctamente.' -ForegroundColor Green
Write-Host 'No se requiere Node.js, PostgreSQL, pgAdmin ni Python instalados en Windows.'
Write-Host "SERVER_URL para las estaciones: http://${lanAddress}:4000" -ForegroundColor Cyan
if(-not $NonInteractive){Read-Host 'Presiona Enter para cerrar'}
