@echo off
setlocal
set ADB="C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe"
set BASE=D:\.github\mobileapp

echo ===== 等待设备 =====
%ADB% wait-for-device
%ADB% devices

echo.
echo ===== 1/5 Mobile-Harness (com.jarves.mh) =====
%ADB% install -r -t "%BASE%\mobile-harness\app\build\outputs\apk\online\debug\app-online-debug.apk"

echo.
echo ===== 2/5 buddy-android (app.buddy.assistant) =====
%ADB% install -r -t "%BASE%\buddy-android\app\build\outputs\apk\github\debug\app-github-debug.apk"

echo.
echo ===== 3/5 AnyCode (anycoding) =====
%ADB% install -r -t "%BASE%\anycoding\any-code-android\app\build\outputs\apk\debug\AnyCode-v1.0.8-debug.apk"

echo.
echo ===== 4/5 Kammel SSH (terminal_agent) =====
%ADB% install -r -t "%BASE%\kammel-ssh\build\app\outputs\flutter-apk\app-debug.apk"

echo.
echo ===== 5/5 Sesori =====
%ADB% install -r -t "%BASE%\sesori\client\app\build\app\outputs\flutter-apk\app-debug.apk"

echo.
echo ===== 完成。已安装的相关包： =====
%ADB% shell pm list packages | findstr /I "jarves buddy anycoding terminal_agent sesori"
endlocal
