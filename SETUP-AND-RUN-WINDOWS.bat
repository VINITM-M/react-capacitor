@echo off
setlocal
cd /d "%~dp0"
title ReactorPlan - Setup and Run

echo.
echo =============================================
echo   ReactorPlan - Setup, Verify and Run
echo =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Install the current Node.js LTS release, then reopen this file.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js LTS with npm enabled.
  pause
  exit /b 1
)

echo [1/3] Installing exact dependencies from package lock files...
call npm run install:all
if errorlevel 1 (
  echo.
  echo ERROR: Dependency installation failed. Check internet/proxy access and read VITE-TROUBLESHOOTING.md.
  pause
  exit /b 1
)

echo.
echo [2/3] Running workbook, UI and contract checks...
call npm run verify
if errorlevel 1 (
  echo.
  echo ERROR: One or more validation checks failed. Resolve them before presenting the app.
  pause
  exit /b 1
)

echo.
echo [3/3] Starting ReactorPlan...
echo Keep this window open while using the app.
echo The frontend normally opens at http://127.0.0.1:5173
echo The backend health endpoint is http://127.0.0.1:4000/api/health
echo Press Ctrl+C to stop both services.
echo.
call npm run dev
pause
