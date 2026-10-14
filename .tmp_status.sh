#!/bin/bash
cd "D:/.github/mobileapp" || exit 1
for d in "$@"; do
  apk=$(find "$d" -path "*/outputs/apk/*" -name "*.apk" 2>/dev/null | head -1)
  echo "$d :: ${apk:-NONE}"
done
