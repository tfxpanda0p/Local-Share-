@echo off
TITLE LocalShare
color 0a

echo ===========================================
echo Starting LocalShare Network Utility...
echo ===========================================
echo.

:: Open the browser
start "" http://localhost:3000

:: Run the server
node server.js

pause
