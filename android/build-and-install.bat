@echo off
REM ============================================================
REM  Build and install doge-code Android client.
REM  Step 1: assemble debug APK (Android only; CLI built by bun).
REM  Step 2: if a device is connected via adb, push + install.
REM  Otherwise compile only and report the APK path.
REM ============================================================

SETLOCAL
cd /d "D:\doge-code\android"
SET "ANDROID_HOME=C:\Program Files (x86)\Android\android-sdk"
SET "ANDROID_SDK=C:\Program Files (x86)\Android\android-sdk"
SET "JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14"
SET "ADB=%ANDROID_SDK%\platform-tools\adb.exe"
SET "GRADLE=D:\doge-code\android\.gradle-dist\gradle-8.9\bin\gradle.bat"
SET "APK=D:\doge-code\android\app\build\outputs\apk\debug\app-debug.apk"

echo [1/3] Assembling debug APK ...
call "%GRADLE%" assembleDebug --offline
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build done: %APK%

echo [2/3] Installing to device if connected ...
"%ADB%" push "%APK%" /data/local/tmp/app.apk >nul 2>&1
if errorlevel 1 (
    echo [WARN] No device connected. Connect phone with USB debugging or wireless debug, then rerun.
    echo [DONE] Compiled only. APK at:
    echo        %APK%
    pause
    exit /b 0
)

"%ADB%" shell pm install -r -t -d --user 0 /data/local/tmp/app.apk
if errorlevel 1 (
    echo [RETRY] First install failed, wait 2s and retry ...
    ping -n 3 127.0.0.1 >nul
    "%ADB%" shell pm install -r -t -d --user 0 /data/local/tmp/app.apk
)
echo [DONE] Install flow finished.
pause
ENDLOCAL
