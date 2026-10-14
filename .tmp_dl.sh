#!/bin/bash
# 下载 gradle 发行版到 D:/.github/mobileapp/.gradle-dist/
DEST="D:/.github/mobileapp/.gradle-dist"
mkdir -p "$DEST"
V="$1"
URL="https://downloads.gradle.org/distributions/gradle-${V}.zip"
OUT="$DEST/gradle-${V}.zip"
if [ -f "$OUT" ]; then echo "EXISTS $OUT"; exit 0; fi
echo "downloading gradle-${V} ..."
curl -sL --retry 5 --retry-delay 3 -C - -o "$OUT" -m 900 "$URL"
sz=$(stat -c%s "$OUT" 2>/dev/null)
echo "gradle-${V}: size=$sz"
# 校验 zip 完整性
if unzip -t "$OUT" >/dev/null 2>&1; then echo "ZIP_OK gradle-${V}"; else echo "ZIP_BAD gradle-${V}"; fi
