@echo off
setlocal
cd /d "%~dp0"
set "SITE_ROOT=G:\CODEX-APPS\tommulliner.com"
start "" "http://localhost:4177"
npm run local
pause
