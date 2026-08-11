#!/bin/bash
# Auto-generated clone script
BASE="D:/doge-code/.github"
try_clone() {
  local repo=$1 dir=$2 target="$BASE/$dir"
  if [ -d "$target" ]; then echo "[SKIP] $dir"; else echo "[CLONE] $repo -> $dir"; git clone --depth 1 "https://github.com/$repo.git" "$target" 2>&1 | tail -3; fi
}

