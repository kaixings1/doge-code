#!/bin/bash
D="C:/Users/Administrator/.gradle/wrapper/dists"
for v in gradle-8.10.2-bin gradle-8.13-bin gradle-8.14-all gradle-8.3-all gradle-9.1.0-all gradle-9.4.1-bin gradle-9.8.1-bin; do
  sub=$(ls "$D/$v" 2>/dev/null | head -1)
  if [ -z "$sub" ]; then echo "$v : EMPTY"; continue; fi
  hasdir=$(find "$D/$v/$sub" -maxdepth 1 -type d -name "gradle-*" 2>/dev/null | head -1)
  haspart=$(find "$D/$v/$sub" -name "*.part" 2>/dev/null | head -1)
  haszip=$(find "$D/$v/$sub" -maxdepth 1 -name "*.zip" 2>/dev/null | head -1)
  echo "$v : sub=$sub | extracted=${hasdir:-NO} | part=${haspart:-NO} | zip=${haszip:-NO}"
done
