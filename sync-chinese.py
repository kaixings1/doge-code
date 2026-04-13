#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汉化同步工具
从 src-broken-backup（已修复乱码）中提取汉化内容
同步到 src 目录的对应文件中
"""

import os
import re
from pathlib import Path

BROKEN_DIR = r'D:\doge-code\src-broken-backup'
SRC_DIR = r'D:\doge-code\src'

def count_chinese(text: str) -> int:
    return len(re.findall(r'[\u4e00-\u9fff]', text))

def find_chinese_lines(file_path: Path) -> list:
    result = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                if count_chinese(line) > 0:
                    result.append((i, line.rstrip()))
    except:
        pass
    return result

def interactive_sync():
    print('=' * 80)
    print('汉化内容同步工具')
    print('从 src-broken-backup 提取汉化内容 -> 同步到 src 目录')
    print('=' * 80)
    print()
    
    # 找到所有包含中文的 broken 文件
    print('扫描包含中文的文件...')
    chinese_files = []
    
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        for file_path in Path(BROKEN_DIR).rglob(ext):
            relative = file_path.relative_to(BROKEN_DIR)
            src_file = Path(SRC_DIR) / relative
            
            if src_file.exists():
                chinese_lines = find_chinese_lines(file_path)
                if chinese_lines:
                    chinese_count = sum(count_chinese(line) for _, line in chinese_lines)
                    chinese_files.append({
                        'broken': file_path,
                        'src': src_file,
                        'relative': str(relative),
                        'chinese_lines': chinese_lines,
                        'chinese_count': chinese_count,
                    })
    
    print(f'找到 {len(chinese_files)} 个包含中文的文件\n')
    chinese_files.sort(key=lambda x: x['chinese_count'], reverse=True)
    
    # 显示统计
    print('文件统计（按中文字符数排序）:')
    print('-' * 80)
    for i, f in enumerate(chinese_files[:30], 1):
        print(f"  {i:3d}. {f['relative'][:65]:65s} ({f['chinese_count']:4d} 字)")
    if len(chinese_files) > 30:
        print(f"  ... 还有 {len(chinese_files) - 30} 个文件")
    print()
    
    # 交互式处理
    total_applied = 0
    total_skipped = 0
    
    for file_info in chinese_files:
        print(f"\n{'='*80}")
        print(f"文件: {file_info['relative']}")
        print(f"包含 {len(file_info['chinese_lines'])} 行中文内容")
        print(f"{'='*80}")
        
        skip_file = False
        
        for line_num, broken_line in file_info['chinese_lines']:
            if skip_file:
                total_skipped += 1
                continue
            
            # 读取 src 对应行
            try:
                with open(file_info['src'], 'r', encoding='utf-8') as f:
                    src_lines = f.readlines()
                src_line = src_lines[line_num - 1].rstrip() if line_num <= len(src_lines) else '(文件较短)'
            except:
                src_line = '(无法读取)'
            
            src_cn = count_chinese(src_line)
            broken_cn = count_chinese(broken_line)
            
            # 如果 src 已有相同或更多的中文，跳过
            if src_cn >= broken_cn and src_cn > 0:
                continue
            
            print(f"\n第 {line_num} 行:")
            print(f"  [src]    {src_line[:120]}")
            print(f"  [broken] {broken_line[:120]}")
            
            while True:
                choice = input(f"  选择 (y=应用/n=跳过/a=全部应用/s=跳过文件/q=退出): ").strip().lower()
                
                if choice == 'q':
                    print(f"\n同步暂停。已应用 {total_applied} 处，跳过 {total_skipped} 处")
                    return
                elif choice == 'y':
                    # 应用汉化
                    try:
                        with open(file_info['src'], 'r', encoding='utf-8') as f:
                            lines = f.readlines()
                        
                        if line_num <= len(lines):
                            old_line = lines[line_num - 1]
                            indent = len(old_line) - len(old_line.lstrip())
                            broken_stripped = broken_line.strip()
                            new_line = ' ' * indent + broken_stripped + '\n'
                            lines[line_num - 1] = new_line
                            
                            with open(file_info['src'], 'w', encoding='utf-8') as f:
                                f.writelines(lines)
                            
                            print(f"  [OK] 已应用")
                            total_applied += 1
                    except Exception as e:
                        print(f"  [错误] {e}")
                    break
                elif choice == 'n':
                    print(f"  [跳过]")
                    total_skipped += 1
                    break
                elif choice == 'a':
                    print(f"  [OK] 应用此文件所有汉化...")
                    for remaining_num, remaining_line in file_info['chinese_lines']:
                        if remaining_num < line_num:
                            continue
                        try:
                            with open(file_info['src'], 'r', encoding='utf-8') as f:
                                lines = f.readlines()
                            if remaining_num <= len(lines):
                                old_line = lines[remaining_num - 1]
                                indent = len(old_line) - len(old_line.lstrip())
                                new_line = ' ' * indent + remaining_line.strip() + '\n'
                                lines[remaining_num - 1] = new_line
                                with open(file_info['src'], 'w', encoding='utf-8') as f:
                                    f.writelines(lines)
                                total_applied += 1
                        except:
                            pass
                    skip_file = True
                    break
                elif choice == 's':
                    print(f"  [跳过文件]")
                    skip_file = True
                    total_skipped += 1
                    break
    
    print(f"\n{'='*80}")
    print(f"同步完成!")
    print(f"  已应用: {total_applied} 处")
    print(f"  已跳过: {total_skipped} 处")
    print(f"{'='*80}")

if __name__ == '__main__':
    interactive_sync()
