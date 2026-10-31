@echo off
echo ============================================================
echo  TEAMBrain Backend Startup
echo ============================================================
echo.
echo Starting FastAPI backend on http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo.
cd /d "%~dp0"
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) else (
    py -3.13 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
)
