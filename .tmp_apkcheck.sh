#!/bin/bash
cd "D:/.github/mobileapp" || exit 1
for d in and-code buddy-android codex-android codex-mobile-oneapk Conch Cosmic-IDE debroid Lyra-Code mobby mobile-harness OmniBot opencode-android-apk Operator-on-Android pairlet Pocket-Agent-CLI termux-ai-app ZorvAI; do
  apk=$(find "$d" -path "*/outputs/apk/*" -name "*.apk" 2>/dev/null | head -1)
  echo "$d :: ${apk:-NONE}"
done
