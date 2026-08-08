@echo off
setlocal
set MSYS_NO_PATHCONV=1
node "%~dp0search.cjs" %*
endlocal
