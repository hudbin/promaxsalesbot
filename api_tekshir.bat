@echo off
chcp 65001 >nul
cd /d "%~dp0"
.venv\Scripts\python api_tekshir.py
pause
