#!/bin/bash
echo "检查纯英文注释（需要汉化）..."
echo ""

# 只查找纯英文的注释行（不包含中文字符）
for file in $(find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/.git/*" | head -50); do
  # 查找纯英文注释（不包含中文）
  en_only=$(grep -P "//.*[\x00-\x7F]+" "$file" 2>/dev/null | \
    grep -vP "[\x80-\xFF]|import |export |from |https?://|www\.|as const|//\s*$" | \
    grep -P "^[ \t]*//.*[a-zA-Z]{3,}.*//[^\x80-\xFF]*$" | \
    head -5)
  
  if [ ! -z "$en_only" ]; then
    echo "📄 $file"
    echo "$en_only"
    echo ""
  fi
done

echo "检查完成！"
