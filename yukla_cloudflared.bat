@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist cloudflared.exe (
  echo cloudflared.exe allaqachon bor.
  goto son
)
set URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
echo 1-usul: curl orqali yuklanmoqda...
curl -L --retry 3 --retry-delay 2 -o cloudflared.exe "%URL%" 2>nul
if exist cloudflared.exe goto tekshir
echo 2-usul: PowerShell orqali yuklanmoqda...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; for($i=1;$i -le 3;$i++){ try{ Invoke-WebRequest -Uri '%URL%' -OutFile 'cloudflared.exe' -UseBasicParsing -TimeoutSec 120; break }catch{ Write-Host ('urinish '+$i+': '+$_.Exception.Message); Start-Sleep 3 } }"
:tekshir
if not exist cloudflared.exe (
  echo.
  echo Yuklab bolmadi. Brauzerda oching va faylni shu papkaga saqlang:
  echo %URL%
  echo Saqlangan fayl nomi: cloudflared.exe
  echo Mini appsiz ham bot ishlayveradi.
  goto son
)
for %%F in (cloudflared.exe) do if %%~zF LSS 1000000 (
  echo Fayl toliq yuklanmadi, ochirildi.
  del cloudflared.exe
  goto son
)
echo Tayyor: cloudflared.exe yuklandi.
:son
pause
