@echo off
setlocal
set MSYS_NO_PATHCONV=1
node "%~dp0grep.cjs" %*
endlocal
