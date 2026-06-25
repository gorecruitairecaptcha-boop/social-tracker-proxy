@echo off
cd /d "E:\Office\Social Track\Social Tracker\render-proxy"
del .git\index.lock 2>nul
del .git\HEAD.lock 2>nul
del .git\refs\heads\main.lock 2>nul
git add -A
git commit -m "Fix sync timeout: parallel LinkedIn API calls + 4s per-call timeout"
git push origin main
pause
