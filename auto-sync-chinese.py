#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汉化自动同步工具（无需交互）
从 src-broken-backup 中提取汉化内容，智能同步到 src 目录
"""

import os
import re
from pathlib import Path

BROKEN_DIR = r'D:\doge-code\src-broken-backup'
SRC_DIR = r'D:\doge-code\src'

def count_chinese(text: str) -> int:
    return len(re.findall(r'[\u4e00-\u9fff]', text))

def auto_sync():
    print('=' * 80)
    print('汉化自动同步工具（非交互模式）')
    print('=' * 80)
    print()
    
    total_files = 0
    total_lines = 0
    applied_lines = 0
    skipped_lines = 0
    
    # 遍历所有 broken 文件
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        for broken_file in Path(BROKEN_DIR).rglob(ext):
            relative = broken_file.relative_to(BROKEN_DIR)
            src_file = Path(SRC_DIR) / relative
            
            if not src_file.exists():
                continue
            
            total_files += 1
            
            try:
                with open(broken_file, 'r', encoding='utf-8') as f:
                    broken_lines = f.readlines()
                
                with open(src_file, 'r', encoding='utf-8') as f:
                    src_lines = f.readlines()
            except Exception as e:
                print(f"[跳过] {relative}: {e}")
                continue
            
            modified = False
            file_applied = 0
            file_skipped = 0
            
            # 逐行检查
            for i in range(min(len(broken_lines), len(src_lines))):
                broken_line = broken_lines[i]
                src_line = src_lines[i]
                
                broken_cn = count_chinese(broken_line)
                src_cn = count_chinese(src_line)
                
                # broken 有更多中文，且内容不同
                if broken_cn > src_cn and broken_line.strip() != src_line.strip():
                    # 保留 src 的缩进
                    indent = len(src_line) - len(src_line.lstrip())
                    new_line = ' ' * indent + broken_line.strip() + '\n'
                    
                    src_lines[i] = new_line
                    modified = True
                    file_applied += 1
                elif broken_cn > 0 and src_cn > 0:
                    file_skipped += 1
            
            # 写入修改
            if modified:
                try:
                    with open(src_file, 'w', encoding='utf-8') as f:
                        f.writelines(src_lines)
                    print(f"[OK] {relative}: 应用 {file_applied} 行，跳过 {file_skipped} 行")
                except Exception as e:
                    print(f"[错误] {relative}: {e}")
            
            applied_lines += file_applied
            skipped_lines += file_skipped
            total_lines += file_applied + file_skipped
    
    print()
    print('=' * 80)
    print('同步完成！')
    print(f'  扫描文件: {total_files}')
    print(f'  总汉化行: {total_lines}')
    print(f'  已应用: {applied_lines}')
    print(f'  已跳过: {skipped_lines}')
    print('=' * 80)

if __name__ == '__main__':
    auto_sync()
