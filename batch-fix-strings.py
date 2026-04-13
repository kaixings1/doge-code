#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量修复常见的字符串和语法错误
"""

import re
from pathlib import Path

SRC_DIR = r'D:\doge-code\src'

# 常见错误模式及修复
FIXES = [
    # 未闭合的字符串（单引号）
    (r"(' [^'\n]*?）([^'\n]*)$", lambda m: f"{m.group(1)}。'"),
    # 未闭合的字符串（中文后缺少引号）
    (r"content: '([^']*[^\x00-\x7F][^']*)$',", lambda m: f"content: '{m.group(1)}。',"),
    # 错误的结尾标点
    (r'（[）)]', '（）'),
]

def fix_file(file_path: Path) -> int:
    """修复文件中的常见错误"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return 0
    
    original = content
    fixes_applied = 0
    
    # 查找未闭合的字符串
    # 模式：' 中文...） 或者 ' 中文... 缺少 '
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        # 查找 '文本） 模式（缺少闭合引号）
        if re.search(r"'[^']*?[）)]\s*,?\s*$", line) and line.count("'") % 2 == 1:
            # 缺少闭合引号
            line = line.rstrip()
            if line.endswith('）,') or line.endswith('）'):
                # 在 ） 前面添加 '
                line = line.replace('）,', "。',", 1)
                line = line.replace('）', "。'", 1)
                fixes_applied += 1
        
        new_lines.append(line)
    
    content = '\n'.join(new_lines)
    
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    return fixes_applied

def main():
    print('批量修复字符串错误...')
    print('=' * 80)
    
    total_fixed = 0
    fixed_files = []
    
    for ext in ['*.ts', '*.tsx']:
        for file_path in Path(SRC_DIR).rglob(ext):
            fixes = fix_file(file_path)
            if fixes > 0:
                relative = file_path.relative_to(SRC_DIR)
                fixed_files.append((str(relative), fixes))
                total_fixed += fixes
    
    print(f'修复了 {len(fixed_files)} 个文件，共 {total_fixed} 处错误\n')
    
    for file_path, fixes in fixed_files[:30]:
        print(f"  [✓] {file_path} ({fixes} 处)")
    
    if len(fixed_files) > 30:
        print(f'  ... 还有 {len(fixed_files) - 30} 个文件')

if __name__ == '__main__':
    main()
