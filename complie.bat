



























ls
ls
ls



ls
ls



ls








 bun build ./src/bootstrap-entry.ts --compile --outfile doge.exe


if %errorlevel% neq 0 (
echo Build failed
exit /b %errorlevel%
)

REM 复制技能素材目录到 exe 同目录（供 /updateskills 命令使用）
if exist ".\src\skills\bundled\high-star-imports\" (
    echo Copying high-star-imports skills bundle...
    if not exist ".\skills\bundled\high-star-imports\" mkdir ".\skills\bundled\high-star-imports\"
    xcopy /E /I /Y ".\src\skills\bundled\high-star-imports\*" ".\skills\bundled\high-star-imports\" >nul
    echo Done.
)

mkdir f:\bin 2>nul
xcopy .\doge.exe F:\bin\ /Y