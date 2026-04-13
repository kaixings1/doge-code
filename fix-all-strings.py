#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
彻底修复所有未闭合的字符串
"""

import re
from pathlib import Path

SRC_DIR = r'D:\doge-code\src'

def fix_unclosed_strings(content: str) -> tuple[str, int]:
    """修复未闭合的字符串"""
    fixes = 0
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        # 查找所有单引号字符串
        # 模式：'中文...） 或 '中文... 缺少 '
        if re.search(r"'[^']*?[^\x00-\x7F][^']*?[^']$", line) and line.count("'") % 2 == 1:
            # 找到未闭合的单引号字符串
            # 在行尾添加 '
            line = line.rstrip()
            # 如果以 ） 或 ) 结尾，替换为 。'
            if line.endswith('）,'):
                line = line[:-2] + "。',"
                fixes += 1
            elif line.endswith('）'):
                line = line[:-1] + "。'"
                fixes += 1
            elif line.endswith('),'):
                line = line[:-2] + "。',"
                fixes += 1
            elif line.endswith(')'):
                line = line[:-1] + "。'"
                fixes += 1
            elif not line.endswith("'"):
                line = line + "'"
                fixes += 1
        
        new_lines.append(line)
    
    return '\n'.join(new_lines), fixes

def main():
    print('彻底修复未闭合字符串...')
    print('=' * 80)
    
    total_fixed = 0
    fixed_files = []
    
    for ext in ['*.ts', '*.tsx']:
        for file_path in Path(SRC_DIR).rglob(ext):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content, fixes = fix_unclosed_strings(content)
                
                if fixes > 0:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    
                    relative = file_path.relative_to(SRC_DIR)
                    fixed_files.append((str(relative), fixes))
                    total_fixed += fixes
            except:
                pass
    
    print(f'修复了 {len(fixed_files)} 个文件，共 {total_fixed} 处错误\n')
    
    for file_path, fixes in fixed_files[:50]:
        print(f"  [✓] {file_path} ({fixes} 处)")
    
    if len(fixed_files) > 50:
        print(f'  ... 还有 {len(fixed_files) - 50} 个文件')

if __name__ == '__main__':
    main()
