@echo off

chcp 65001 >nul

REM === doge-code Android shell build helper ===
REM Checks the toolchain, then builds a debug APK.
REM
REM Gradle resolution order:
REM   1. gradlew (wrapper) if present
REM   2. global "gradle" on PATH
REM   3. auto-download gradle-8.9 to .gradle-dist and use it
REM The third fallback means you only need JDK + Android SDK to build.
REM
REM IMPORTANT: keep this file pure ASCII with CRLF line endings.
REM cmd.exe decodes batch files using the ANSI code page (GBK on zh-CN);
REM UTF-8 Chinese bytes can swallow the following newline and merge lines,
REM causing REM comments to run as commands.

setlocal enabledelayedexpansion

echo [build] checking toolchain...

where java >nul 2>&1
if errorlevel 1 (
    echo   FAIL java not found. Install JDK 17+ ^(Android Studio bundles one^).
    echo        choco install -y temurin17      ^(run as Administrator^)
    exit /b 1
)

if "%ANDROID_HOME%"=="" (
    if "%ANDROID_SDK_ROOT%"=="" (
        echo   FAIL ANDROID_HOME not set. Install Android SDK ^(Platform 35^).
        echo        choco install -y android-sdk  ^(run as Administrator^)
        echo        then: set ANDROID_HOME=%%LOCALAPPDATA%%\Android\Sdk
        exit /b 1
    ) else (
        echo   ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%
    )
) else (
    echo   ANDROID_HOME=%ANDROID_HOME%
)

REM --- resolve gradle ---
set GRADLE_CMD=
if exist "gradlew.bat" (
    set GRADLE_CMD=gradlew.bat
    echo   gradle: wrapper
) else (
    where gradle >nul 2>&1
    if not errorlevel 1 (
        set GRADLE_CMD=gradle
        echo   gradle: system PATH
    ) else (
        set DIST_DIR=%~dp0.gradle-dist
        if not exist "!DIST_DIR!\gradle-8.9\bin\gradle.bat" (
            echo   gradle: not found, downloading 8.9 to .gradle-dist ...
            where powershell >nul 2>&1
            if errorlevel 1 (
                echo   FAIL need PowerShell to auto-download gradle.
                echo        Install Gradle 8.5+ manually.
                exit /b 1
            )
            if not exist "!DIST_DIR!" mkdir "!DIST_DIR!"
            REM Path passed via env var to avoid quoting issues (spaces in path).
            set GRADLE_DL_DIR=!DIST_DIR!
            powershell -NoProfile -Command "& { $d=$env:GRADLE_DL_DIR; $u='https://services.gradle.org/distributions/gradle-8.9-bin.zip'; $z=Join-Path $d 'gradle-8.9-bin.zip'; Invoke-WebRequest -Uri $u -OutFile $z; Expand-Archive -Path $z -DestinationPath $d -Force; Remove-Item $z }"
            if not exist "!DIST_DIR!\gradle-8.9\bin\gradle.bat" (
                echo   FAIL gradle auto-download failed. Install Gradle manually.
                exit /b 1
            )
        )
        set GRADLE_CMD=!DIST_DIR!\gradle-8.9\bin\gradle.bat
        echo   gradle: auto-downloaded 8.9
    )
)

echo.
echo [build] running %GRADLE_CMD% assembleDebug ...
call %GRADLE_CMD% assembleDebug
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
        set ADB=%%USERPROFILE%%\Android\platform-tools\adb.exe
        if exist "!ADB!" (
            echo [install] "!ADB!" install -r "%APK%"
        ) else (
            echo [install] adb not found. Copy the apk to your phone manually.
        )
    ) else (
        echo [install] adb install -r "%APK%"
    )
) else (
    echo.
    echo [build] apk not found at %APK%
    exit /b 1
)

endlocal
