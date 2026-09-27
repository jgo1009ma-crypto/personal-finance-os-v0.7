@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Personal Finance OS requiere Node.js 18 o superior.
  echo Instala Node.js y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0api"
echo.
echo Personal Finance OS v0.6
 echo Abre http://localhost:8787 en tu navegador.
echo Cierra esta ventana para detener el servidor.
echo.
node server.js
pause
