#!/bin/bash
echo "检查未汉化的英文注释..."
echo ""

# 检查常见的英文注释模式
files=$(find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/.git/*" | head -50)

for file in $files; do
  # 检查是否包含英文注释（排除 import/export 语句）
  en_comments=$(grep -E "//.*[a-zA-Z]{3,}.*//|/\*[^*]*[a-zA-Z]{3,}.*\*/" "$file" 2>/dev/null | grep -v "import \|export \|from \|as const" | head -5)
  if [ ! -z "$en_comments" ]; then
    echo "文件: $file"
    echo "$en_comments"
    echo "---"
  fi
done

echo ""
echo "检查完成！"
