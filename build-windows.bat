@echo off
REM ─────────────────────────────────────────────────────────────────
REM  BJJ Mat Timer — Windows Build Script
REM  Double-click this file to build the Windows .exe installer
REM  Requires Node.js v18+ installed from https://nodejs.org
REM ─────────────────────────────────────────────────────────────────

echo.
echo  BJJ Mat Timer — Building for Windows
echo  ─────────────────────────────────────
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo  ERROR: Node.js not found.
  echo  Install from https://nodejs.org ^(LTS version^)
  echo.
  pause
  exit /b 1
)

echo  Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 ( echo  npm install failed & pause & exit /b 1 )

echo  Building Windows installer...
call npx electron-builder --win nsis --publish never
if %ERRORLEVEL% neq 0 ( echo  Build failed & pause & exit /b 1 )

echo.
echo  ─────────────────────────────────────
echo  Build complete! Installer is in dist\
echo  Run dist\*Setup*.exe to install.
echo  ─────────────────────────────────────
echo.
pause
