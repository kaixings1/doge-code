#!/bin/bash
SRC="D:/.github/mobileapp/moke/gradle/wrapper/gradle-wrapper.jar"
cd "D:/.github/mobileapp" || exit 1
for d in and-code buddy-android codex-android codex-mobile-oneapk Conch Cosmic-IDE debroid Lyra-Code mobby mobile-harness OmniBot opencode-android-apk Operator-on-Android pairlet Pocket-Agent-CLI termux-ai-app ZorvAI; do
  if [ -d "$d/gradle/wrapper" ] && [ ! -f "$d/gradle/wrapper/gradle-wrapper.jar" ]; then
    cp "$SRC" "$d/gradle/wrapper/gradle-wrapper.jar" && echo "FIXED $d"
  elif [ -f "$d/gradle/wrapper/gradle-wrapper.jar" ]; then
    echo "OK    $d"
  else
    echo "NOWRAP $d"
  fi
done
