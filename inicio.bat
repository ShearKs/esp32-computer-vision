@echo off
echo 🚀 Iniciando Robot IA + Backend...

REM --- Paso 1: Arrancar el backend Python ---
cd backend

REM Activar el entorno virtual de Python
call ..\.venv\Scripts\activate.bat

REM Ahora uvicorn usará el Python con todas las dependencias instaladas
start "Backend" cmd /k "uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 4 >nul

REM --- Arrancamos la aplicación ---
cd ..\frontend\robot-vision-app
start "Frontend" cmd /k "ionic serve"

echo Ambos servicios lanzados 🥵.
echo Abre http://localhost:8100 en tu navegador.
pause