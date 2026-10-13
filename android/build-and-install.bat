@echo off
REM ============================================================
REM  Build and install doge-code Android client.
REM  Step 1: assemble debug APK (Android only; CLI built by bun).
REM  Step 2: if a device is connected via adb, push + install.
REM  Otherwise compile only and report the APK path.
REM
REM  Why --no-build-cache:
REM    After changing res/ (layout, values), Gradle reuses stale merged
REM    resources. The APK then ships an OLD layout while the Kotlin code
REM    expects NEW ids -> findViewById returns null at runtime -> crash.
REM    This was hit in practice (ChatFragment crash). Costs a few seconds.
REM
REM  Why "do not install on build failure":
REM    adb install keeps reporting Success even when it installs the
REM    PREVIOUS apk (because the new one was never produced). That makes
REM    a broken build look like a working one. So we abort before install.
REM
REM  IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM  cmd.exe decodes batch files with the ANSI code page; UTF-8 Chinese
REM  bytes get mangled and can swallow the newline, merging lines so that
REM  comments run as commands.
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
call "%GRADLE%" assembleDebug --offline --no-build-cache
if errorlevel 1 (
    echo [ERROR] Build failed. Not installing ^(would install a stale apk^).
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
