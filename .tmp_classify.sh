#!/bin/bash
cd "D:/.github/mobileapp" || exit 1
for d in */; do
  d="${d%/}"
  [ -f "$d/I18N_PLAN.md" ] && continue
  kind=""
  # Android 原生工程（可构建 APK）
  if [ -f "$d/settings.gradle" ] || [ -f "$d/settings.gradle.kts" ] || [ -f "$d/build.gradle" ] || [ -f "$d/build.gradle.kts" ]; then
    kind="ANDROID_GRADLE"
  fi
  # 子目录里有 android/ 工程
  if [ -d "$d/android" ]; then kind="$kind+android/"; fi
  if [ -d "$d/app" ]; then kind="$kind+app/"; fi
  # Flutter
  [ -f "$d/pubspec.yaml" ] && kind="$kind+FLUTTER"
  # React Native / Expo
  [ -f "$d/app.json" ] || [ -f "$d/app.config.js" ] && kind="$kind+EXPO/RN"
  # 纯脚本 / Termux
  [ -f "$d/install.sh" ] && kind="$kind+install.sh"
  [ -f "$d/*.sh" ] && kind="$kind+sh"
  # Node
  [ -f "$d/package.json" ] && kind="$kind+NODE"
  # prebuilt APK
  apks=$(find "$d" -maxdepth 3 -iname "*.apk" 2>/dev/null | head -3)
  [ -n "$apks" ] && kind="$kind+APK[$apks]"
  echo "[$kind] $d"
done
