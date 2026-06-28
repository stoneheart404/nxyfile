@echo off
echo Starting EasyApp web mode...
cd /d "%~dp0"
start http://localhost:3000
npm run web
