@echo off
call bun build ./src/bootstrap-entry.ts --compile --outfile doge.exe
if %errorlevel% neq 0 (
echo Build failed
exit /b %errorlevel%
)
 xcopy .\doge.exe F:\bin\ /Y