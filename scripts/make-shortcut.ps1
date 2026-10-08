# Creates the desktop shortcut "APT Assistant" (ASCII only: Windows PowerShell 5.1 reads this file without BOM).
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profileDir = Join-Path $env:LOCALAPPDATA 'APT-Assistant\chrome-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$appUrl = 'file:///E:/APT%20assistant/app/index.html'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'APT Assistant.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $chrome
$lnk.Arguments = "--user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --app=`"$appUrl`""
$lnk.WorkingDirectory = 'E:\APT assistant'
$lnk.Description = 'APT Assistant (DCAT/LG practice)'
$lnk.Save()
Write-Output "shortcut -> $lnkPath"
