#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检测 src 目录中被改坏的文件（语法错误）
不恢复，只列出需要修复的文件
"""

import re
from pathlib import Path

SRC_DIR = r'D:\doge-code\src'

def check_syntax_errors(file_path: Path) -> list[str]:
    """检查文件中的常见语法错误"""
    errors = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.split('\n')
    except:
        return []
    
    for i, line in enumerate(lines, 1):
        # 检测常见错误模式
        
        # 1. 缺少 { 的情况：if (...) \n  content
        if re.match(r'^\s*if\s*\(.*\)\s*$', line) and i < len(lines):
            next_line = lines[i].strip() if i < len(lines) else ''
            if next_line and not next_line.startswith('{') and not next_line.startswith('//') and not next_line.startswith('/*'):
                # 可能是遗漏了 {
                if re.match(r'^\w+', next_line) and not next_line.startswith('return') and not next_line.startswith('throw'):
                    errors.append(f"第 {i} 行: if 语句后可能缺少 {{")
        
        # 2. 多余的 }
        if re.match(r'^\s*\}\s*$', line) and i > 0:
            # 检查前面的行是否匹配
            prev_lines = '\n'.join(lines[max(0,i-5):i])
            # 如果前面没有对应的 {，可能是多余的
            open_count = prev_lines.count('{') - prev_lines.count('//')  # 简化检查
            close_count = prev_lines.count('}')
            # 这个检查不准确，跳过
    
    return errors

def main():
    print('检测语法错误...')
    print('=' * 80)
    
    error_files = []
    
    for ext in ['*.ts', '*.tsx']:
        for file_path in Path(SRC_DIR).rglob(ext):
            errors = check_syntax_errors(file_path)
            if errors:
                relative = file_path.relative_to(SRC_DIR)
                error_files.append((str(relative), errors))
    
    print(f'找到 {len(error_files)} 个可能有语法错误的文件:\n')
    
    for file_path, errors in error_files[:50]:  # 只显示前 50 个
        print(f"\n{file_path}:")
        for error in errors[:5]:  # 每个文件只显示前 5 个错误
            print(f"  - {error}")
    
    if len(error_files) > 50:
        print(f'\n... 还有 {len(error_files) - 50} 个文件')

if __name__ == '__main__':
    main()
