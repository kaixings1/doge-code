@echo off

chcp 65001 >nul

REM === doge-code Android shell build helper ===
REM Checks the toolchain, then builds a debug APK.
REM
REM IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM cmd.exe decodes batch files using the ANSI code page (GBK on zh-CN);
REM UTF-8 Chinese bytes can swallow the following newline and merge lines,
REM causing REM comments to run as commands.

setlocal

echo [build] checking toolchain...

where java >nul 2>&1
if errorlevel 1 (
    echo   FAIL java not found. Install JDK 17+ ^(Android Studio bundles one^).
    exit /b 1
)
for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    echo   java %%v
    goto :java_ok
)
:java_ok

if "%ANDROID_HOME%"=="" (
    if "%ANDROID_SDK_ROOT%"=="" (
        echo   FAIL ANDROID_HOME not set. Install Android SDK ^(Platform 34^).
        echo        e.g. set ANDROID_HOME=%%LOCALAPPDATA%%\Android\Sdk
        exit /b 1
    ) else (
        echo   ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%
    )
) else (
    echo   ANDROID_HOME=%ANDROID_HOME%
)

where gradle >nul 2>&1
if errorlevel 1 (
    echo   FAIL gradle not found. Install Gradle 8.5+ or use Android Studio.
    exit /b 1
)

echo.
echo [build] running gradle assembleDebug ...
call gradle assembleDebug
if errorlevel 1 (
    echo.
    echo [build] FAILED. See output above.
    exit /b 1
)

set APK=app\build\outputs\apk\debug\app-debug.apk
if exist "%APK%" (
    echo.
    echo [build] OK -^> %APK%
    echo.
    where adb >nul 2>&1
    if errorlevel 1 (
        echo [install] adb not found. Copy the apk to your phone manually.
    ) else (
        echo [install] adb install -r "%APK%"
    )
) else (
    echo.
    echo [build] apk not found at %APK%
    exit /b 1
)

endlocal
