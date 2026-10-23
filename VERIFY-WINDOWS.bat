@echo off
setlocal
cd /d "%~dp0"
title ReactorPlan - Verification
call npm run verify
if errorlevel 1 (
  echo.
  echo VALIDATION FAILED. Please inspect the error above.
) else (
  echo.
  echo STATIC AND WORKBOOK VALIDATION PASSED.
  echo Build and interactive browser testing are separate checks.
)
pause
