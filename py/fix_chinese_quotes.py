#!/usr/bin/env python3
import os

# 需要修复的文件列表
files_to_fix = [
    'src/tools/AskUserQuestionTool/prompt.ts',
]

# 中文引号到英文引号的映射
quote_map = {
    '"': '"',
    '"': '"',
    ''': "'",
    ''': "'",
}

for filepath in files_to_fix:
    full_path = os.path.join('D:\\doge-code', filepath)
    if not os.path.exists(full_path):
        print(f'跳过（不存在）: {filepath}')
        continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    for chinese, english in quote_map.items():
        content = content.replace(chinese, english)
    
    if content != original:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'✓ 已修复: {filepath}')
    else:
        print(f'- 无需修复: {filepath}')

print('\n完成！')
