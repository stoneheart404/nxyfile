@echo off
echo Building EasyApp portable .exe...
cd /d "%~dp0"
npm run build:portable
echo.
echo Build complete. Check the dist/ folder.
pause
