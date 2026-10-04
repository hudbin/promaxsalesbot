@echo off
chcp 65001 >nul
rem Kompyuter yonganda botni avtomatik ishga tushirish (Windows "Автозагрузка")
set "PAPKA=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\PromaxHisobotBot.lnk'); $s.TargetPath='%PAPKA%start.bat'; $s.WorkingDirectory='%PAPKA%'; $s.WindowStyle=7; $s.Save()"
if %errorlevel%==0 (
  echo.
  echo Tayyor: kompyuter yonganda bot avtomatik ishga tushadi.
) else (
  echo.
  echo Xato: avtomatik ishga tushirish o'rnatilmadi.
)
pause
