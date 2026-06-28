@echo off
echo Creating desktop shortcut for EasyApp...
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "create-desktop-shortcut.ps1"
