@echo off
cd /d "E:\Office\Social Track\Social Tracker\render-proxy"
echo === Deploying to Vercel (production) ===
call npx vercel --prod --yes --force 2>&1
echo.
echo === Deploy exit code: %ERRORLEVEL% ===
pause
