@echo off
echo Native-only mode now requires PostgreSQL and Redis. Starting the supported local Compose mode instead.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-docker.ps1" -Build
if errorlevel 1 pause
