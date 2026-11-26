@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve_local.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Local server stopped with an error.
    pause
)
