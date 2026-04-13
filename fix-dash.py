#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 â€" 类型的乱码（UTF-8 字节被误读为 Latin-1/CP1252）
"""

import os
import glob

BROKEN_DIR = r'D:\doge-code\src-broken-backup'

# 乱码映射
MOJIBAKE_MAP = {
    'â€"': '—',   # em dash
    'â€"': '—',   # em dash (变体)
    'â€"': '–',   # en dash
    'â€œ': '"',   # 左双引号
    'â€"': '"',   # 右双引号  
    'â€˜': ''',   # 左单引号
    'â€™': ''',   # 右单引号
    'â€¦': '…',   # 省略号
    'â€¢': '•',   # 项目符号
    'Ã—': '×',    # 乘号
    'Ã·': '÷',    # 除号
    'Â': '',      # 多余的非断空格前缀
}

def fix_file(file_path):
    """修复单个文件"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        original = content
        for wrong, right in MOJIBAKE_MAP.items():
            content = content.replace(wrong, right)
        
        if content != original:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        return False

def main():
    print('开始修复 â€" 类型乱码...')
    print('=' * 60)
    
    # 收集文件
    files = []
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        files.extend(glob.glob(os.path.join(BROKEN_DIR, '**', ext), recursive=True))
    
    print(f'找到 {len(files)} 个文件')
    
    fixed_count = 0
    for i, f in enumerate(files, 1):
        if fix_file(f):
            fixed_count += 1
        if i % 200 == 0:
            print(f'已处理 {i}/{len(files)} ...')
    
    print('=' * 60)
    print(f'修复完成！共修复 {fixed_count} 个文件')

if __name__ == '__main__':
    main()
