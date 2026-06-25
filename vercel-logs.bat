@echo off
cd /d "E:\Office\Social Track\Social Tracker\render-proxy"
echo === Vercel Project Info ===
call npx vercel inspect --yes 2>&1
echo.
echo === Recent Vercel Logs ===
call npx vercel logs social-tracker-proxy.vercel.app --yes 2>&1
echo.
pause
