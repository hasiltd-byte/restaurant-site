@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS first.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo COTTA:stert http://localhost:3000
echo Management: http://localhost:3000/order/admin
echo User: pizza in Hebrew. Password: 123
call npm.cmd run dev
