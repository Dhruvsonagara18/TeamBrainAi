@echo off
echo ============================================================
echo  TEAMBrain Frontend Startup
echo ============================================================
echo.
echo Starting React frontend on http://localhost:5173
echo.
cd /d "%~dp0\BuildTeamBrainSaaSApp"
npm run dev
