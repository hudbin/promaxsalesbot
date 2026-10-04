@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Birinchi ishga tushishda kutubxonalarni o'rnatadi
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\pip install -r requirements.txt
)
.venv\Scripts\pip show aiohttp >nul 2>&1 || .venv\Scripts\pip install -r requirements.txt
rem Mini app uchun HTTPS tunnel dasturi
if not exist cloudflared.exe (
  echo Mini app uchun cloudflared yuklab olinmoqda...
  powershell -NoProfile -Command "try{Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe -UseBasicParsing}catch{Write-Host $_.Exception.Message}"
)
:qayta
.venv\Scripts\python bot.py
if %errorlevel%==3 (
  echo.
  echo Bot boshqa oynada allaqachon ishlayapti. Bu oyna 10 soniyadan keyin yopiladi.
  timeout /t 10 >nul
  exit
)
echo Bot toxtadi. 10 soniyadan keyin qayta ishga tushadi...
timeout /t 10 >nul
goto qayta
