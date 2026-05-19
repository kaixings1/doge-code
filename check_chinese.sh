#!/bin/bash
echo "检查未汉化的英文内容..."
echo ""

# 计数器
total_files=0
files_with_en=0
total_en_lines=0

# 检查常见的英文模式（排除技术术语、URL、代码等）
for file in $(find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/.git/*" | head -100); do
  total_files=$((total_files + 1))
  
  # 查找可能未汉化的英文注释
  # 排除: import/export语句、URL、技术术语、单个单词
  en_lines=$(grep -E "//.*[a-zA-Z]{4,}[^\x00-\x7F]*[a-zA-Z]|/\*[^*]*[a-zA-Z]{4,}[^\x00-\x7F]*[a-zA-Z].*\*/" "$file" 2>/dev/null | \
    grep -v "import \|export \|from \|as const\|https://\|http://\|www\." | \
    grep -v -E "//.*[A-Z]{2,}.*//|//.*[0-9].*//" | \
    head -10)
  
  if [ ! -z "$en_lines" ]; then
    files_with_en=$((files_with_en + 1))
    en_count=$(echo "$en_lines" | wc -l)
    total_en_lines=$((total_en_lines + en_count))
    
    echo "📄 $file ($en_count 行)"
    echo "$en_lines" | while read line; do
      echo "   $line"
    done
    echo ""
  fi
done

echo "=========================================="
echo "检查统计:"
echo "  扫描文件数: $total_files"
echo "  包含英文的文件: $files_with_en"
echo "  英文行数: $total_en_lines"
echo "=========================================="

if [ $files_with_en -eq 0 ]; then
  echo "✅ 未发现需要汉化的内容！"
else
  echo "⚠ 发现可能需要汉化的内容"
fi
