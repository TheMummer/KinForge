@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this PC.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

if "%OPENAI_API_KEY%"=="" (
  echo OPENAI_API_KEY is not set for this Windows session.
  echo KinForge will still open, but AI generation will use fallback until the key is available.
  echo.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=4173; " ^
  "$listeners=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; " ^
  "foreach ($listener in $listeners) { " ^
  "  $processId=$listener.OwningProcess; " ^
  "  if ($processId -and $processId -ne $PID) { " ^
  "    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue; " ^
  "  } " ^
  "}; " ^
  "Start-Sleep -Milliseconds 600; " ^
  "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory (Get-Location).Path -WindowStyle Minimized; " ^
  "Start-Sleep -Seconds 2; " ^
  "Start-Process 'http://localhost:4173/'"

echo KinForge restarted and should now be open in your browser.
echo You can close this window.
timeout /t 3 >nul
