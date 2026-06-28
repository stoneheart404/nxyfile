$desktopPath = [Environment]::GetFolderPath('Desktop')
$appPath = Join-Path $PSScriptRoot 'dist\EasyApp-1.0.0-Portable.exe'
$shortcutPath = Join-Path $desktopPath 'EasyApp.lnk'

if (-not (Test-Path $appPath)) {
    Write-Host "Portable executable not found. Run build.bat first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $appPath
$Shortcut.WorkingDirectory = Split-Path $appPath
$Shortcut.Description = "EasyApp Desktop"
$Shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green
Read-Host "Press Enter to exit"
