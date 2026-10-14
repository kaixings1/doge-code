#!/bin/bash
cd "D:/.github/mobileapp" || exit 1
for d in and-code buddy-android codex-android codex-mobile-oneapk Conch Cosmic-IDE debroid Lyra-Code mobby mobile-harness moke OmniBot opencode-android-apk Operator-on-Android pairlet Pocket-Agent-CLI termux-ai-app ZorvAI; do
  if [ -f "$d/gradlew" ]; then w="wrapper"; else w="NO-wrapper"; fi
  gv=$(tr -d '\r' < "$d/gradle/wrapper/gradle-wrapper.properties" 2>/dev/null | awk -F'/' '/distributionUrl/{print $NF}')
  agp=$(cat "$d/build.gradle" "$d/build.gradle.kts" "$d/app/build.gradle" "$d/app/build.gradle.kts" 2>/dev/null | tr -d '\r' | awk -F: '/com.android.tools.build:gradle/{print $NF; exit}')
  dt=$(tr -d '\r' < "$d/gradle/libs.versions.toml" 2>/dev/null | awk -F'=' '/^agp[ ]*=/{gsub(/[\" ]/,"",$2); print $2; exit}')
  echo "$d | $w | gradle=$gv | agp=${agp}${dt}"
done
