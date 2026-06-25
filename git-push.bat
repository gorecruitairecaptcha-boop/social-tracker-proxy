@echo off
cd /d "E:\Office\Social Track\Social Tracker\render-proxy"
del .git\index.lock 2>nul
del .git\HEAD.lock 2>nul
del .git\refs\heads\main.lock 2>nul
git add -A
git commit -m "Fix Node version to 20.x for Vercel compatibility"
git push origin main
pause
