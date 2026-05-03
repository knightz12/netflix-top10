@echo off
title Netflix PH Top 10 Stremio Addon

cd /d D:\stremio-addons\netflix-top10

echo Starting Netflix PH Top 10 addon...
start "Netflix Addon Server" cmd /k "node server.js"

timeout /t 3 >nul

echo Starting Cloudflare tunnel...
echo.
echo COPY the https://xxxx.trycloudflare.com URL then add /manifest.json
echo Example: https://xxxx.trycloudflare.com/manifest.json
echo.

cloudflared tunnel --url http://127.0.0.1:3000

pause