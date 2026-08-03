param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference='Stop'
$dockerEnv=Join-Path $ProjectRoot 'servidor-docker.env'
$composeFile=Join-Path $ProjectRoot 'docker-compose.yml'
$logDirectory=Join-Path $ProjectRoot 'backend\logs'
$logFile=Join-Path $logDirectory 'docker-server.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
function Log([string]$Message){"[$(Get-Date -Format o)] $Message" | Add-Content -LiteralPath $logFile -Encoding UTF8}
try{
  if(-not (Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Docker Desktop no está instalado.'}
  if(-not (Test-Path -LiteralPath $dockerEnv)){throw 'No existe servidor-docker.env.'}
  if(-not (docker info 2>$null)){
    $desktop=@("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe","$env:LOCALAPPDATA\Docker\Docker Desktop.exe") | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
    if(-not $desktop){throw 'No se encontró Docker Desktop.'}
    Start-Process -FilePath $desktop -WindowStyle Hidden
    for($attempt=1;$attempt -le 90;$attempt++){Start-Sleep -Seconds 2;if(docker info 2>$null){break}}
    if(-not (docker info 2>$null)){throw 'Docker Desktop no inició dentro del tiempo esperado.'}
  }
  Set-Location -LiteralPath $ProjectRoot
  Log 'Levantando PostgreSQL y API en Docker.'
  & docker compose --env-file $dockerEnv -f $composeFile up -d *>> $logFile
  if($LASTEXITCODE -ne 0){throw 'Docker Compose no pudo iniciar los servicios.'}
  exit 0
}catch{Log "ERROR: $($_.Exception.Message)";exit 1}
