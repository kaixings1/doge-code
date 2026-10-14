@echo off
SETLOCAL
cd /d "D:\doge-code\android"
SET "ANDROID_HOME=C:\Program Files (x86)\Android\android-sdk"
SET "ANDROID_SDK=C:\Program Files (x86)\Android\android-sdk"
SET "JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14"
SET "GRADLE=D:\doge-code\android\.gradle-dist\gradle-8.9\bin\gradle.bat"
call "%GRADLE%" compileDebugKotlin --offline
echo EXITCODE=%ERRORLEVEL%
ENDLOCAL
