@echo off
SET "PROJ=%~1"
SET "ROOT=D:\.github\mobileapp\%PROJ%"
SET "ANDROID_HOME=D:\android-sdk-w\sdk"
SET "ANDROID_SDK_ROOT=D:\android-sdk-w\sdk"
SET "JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14"
echo ========== BUILD %PROJ% ==========
cd /d "%ROOT%"
if not exist "%ROOT%\gradlew.bat" (
  echo NO_GRADLEW %PROJ%
  exit /b 2
)
call "%ROOT%\gradlew.bat" assembleDebug --no-daemon
echo GRADLE_EXIT=%ERRORLEVEL%
