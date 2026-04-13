@echo off
setlocal enabledelayedexpansion
set count=0
for /f "delims=" %%F in ('dir /s /b *.ts *.tsx 2^>nul ^| findstr /v /i "node_modules"') do (
    findstr /m "编辑文件时出错" "%%F" >nul 2>&1
    if !errorlevel! equ 0 (
        echo %%F
        set /a count+=1
        if !count! geq 20 goto :end
    )
)
:end