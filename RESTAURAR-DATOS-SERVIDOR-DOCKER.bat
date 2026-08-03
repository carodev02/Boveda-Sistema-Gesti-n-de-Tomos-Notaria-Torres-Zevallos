@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoExit -NoProfile -ExecutionPolicy Bypass -File ""%~dp0RESTAURAR-DATOS-SERVIDOR-DOCKER.ps1""'"
