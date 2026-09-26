@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0actualizar-boveda.ps1"
if errorlevel 1 (
  echo.
  echo La actualizacion no se completo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Aplicacion actualizada. Ya puedes abrir Boveda.
pause
