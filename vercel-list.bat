@echo off
cd /d "E:\Office\Social Track\Social Tracker\render-proxy"
echo === Listing Vercel Deployments ===
call npx vercel ls --yes 2>&1
echo.
echo === Vercel Project Link ===
type .vercel\project.json
echo.
echo === Vercel whoami ===
call npx vercel whoami --yes 2>&1
echo.
pause
