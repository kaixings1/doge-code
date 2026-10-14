#!/bin/bash
cd "D:/.github/mobileapp" || exit 1
for d in and-code buddy-android codex-android codex-mobile-oneapk Conch Cosmic-IDE debroid Lyra-Code mobby mobile-harness moke OmniBot opencode-android-apk Operator-on-Android pairlet Pocket-Agent-CLI termux-ai-app ZorvAI; do
  url=$(tr -d '\r' < "$d/gradle/wrapper/gradle-wrapper.properties" 2>/dev/null | awk -F'=' '/distributionUrl/{print $2}')
  echo "$d :: $url"
done
