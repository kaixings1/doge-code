#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量修复 src-broken-backup 目录中的乱码文件
乱码特征：U+FFFD () 替换字符，通常后面跟着 ? 或其他字符
"""

import os
import re
from pathlib import Path

BROKEN_DIR = r'D:\doge-code\src-broken-backup'

# 常见乱码模式及修复规则
REPLACEMENT_RULES = [
    # U+FFFD + ? 结尾的情况 - 根据上下文替换为正确的标点
    (r'\ufffd\?\*/', '） */'),       # 注释结尾
    (r'\ufffd\?\n', '。\n'),          # 句尾
    (r'\ufffd\? ', '。 '),            # 句中
    (r'\ufffd\?', '）'),              # 默认
    
    # 单独的 U+FFFD
    (r'\ufffd\*/', '） */'),
    (r'\ufffd\n', '。\n'),
    (r'\ufffd ', '。 '),
    (r'\ufffd', '）'),
]

# 需要特殊修复的常见乱码词汇
SPECIAL_FIXES = {
    '睡）唤醒': '睡眠/唤醒',
    '过渡）closed': '过渡到 \'closed',
    '过渡）': '过渡到',
    '拒绝）': '拒绝。',
    '未找）': '未找到',
    '未授）': '未授权',
    '例）': '例如',
    '位置）': '位置为',
    '重连）': '重连',
    '函数）': '函数',
    '设置）': '设置时',
    '默认）': '默认',
    '放弃））': '放弃）',
    'true））': 'true。',
    'false））': 'false。',
    '））*/': '） */',
    '协议错误': '协议错误',
    '会话过期': '会话过期',
}


def fix_content(content: str) -> tuple[str, bool]:
    """修复内容中的乱码，返回 (修复后的内容, 是否有修改)"""
    original = content
    modified = False
    
    # 1. 先应用特殊修复规则
    for wrong, right in SPECIAL_FIXES.items():
        if wrong in content:
            content = content.replace(wrong, right)
            modified = True
    
    # 2. 应用通用替换规则
    for pattern, replacement in REPLACEMENT_RULES:
        if re.search(pattern, content):
            content = re.sub(pattern, replacement, content)
            modified = True
    
    return content, modified


def process_file(file_path: Path) -> dict:
    """处理单个文件，返回修复结果"""
    result = {
        'path': str(file_path.relative_to(BROKEN_DIR)),
        'status': 'skipped',
        'replacements': 0,
    }
    
    try:
        # 尝试不同编码读取
        content = None
        for encoding in ['utf-8', 'gbk', 'gb2312', 'utf-8-sig']:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                result['original_encoding'] = encoding
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        
        if content is None:
            result['status'] = 'error: cannot read'
            return result
        
        # 检查是否有 U+FFFD 替换字符
        if '\ufffd' not in content:
            result['status'] = 'ok: no mojibake'
            return result
        
        # 修复内容
        fixed_content, modified = fix_content(content)
        
        if not modified:
            result['status'] = 'no fix applied'
            return result
        
        # 写回文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        
        # 统计替换次数
        result['replacements'] = content.count('\ufffd')
        result['status'] = 'fixed'
        
    except Exception as e:
        result['status'] = f'error: {str(e)}'
    
    return result


def main():
    print('=' * 80)
    print('开始批量修复 src-broken-backup 目录中的乱码文件')
    print('=' * 80)
    
    # 收集所有 .ts 和 .tsx 文件
    files = []
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        files.extend(Path(BROKEN_DIR).rglob(ext))
    
    print(f'找到 {len(files)} 个文件需要检查\n')
    
    # 处理文件
    results = []
    for i, file_path in enumerate(files, 1):
        result = process_file(file_path)
        results.append(result)
        
        if i % 100 == 0:
            print(f'已处理 {i}/{len(files)} ...')
    
    # 统计结果
    fixed = [r for r in results if r['status'] == 'fixed']
    ok = [r for r in results if 'ok' in r['status']]
    errors = [r for r in results if 'error' in r['status']]
    skipped = [r for r in results if r['status'] not in ['fixed', 'ok: no mojibake']]
    
    print('\n' + '=' * 80)
    print('修复完成！统计结果：')
    print('=' * 80)
    print(f'总文件数:     {len(results)}')
    print(f'已修复:       {len(fixed)}')
    print(f'无需修复:     {len(ok)}')
    print(f'跳过/其他:    {len(skipped)}')
    print(f'错误:         {len(errors)}')
    
    if fixed:
        print(f'\n已修复的文件 (前 50 个):')
        print('-' * 80)
        for r in fixed[:50]:
            print(f'  [✓] {r["path"]} ({r["replacements"]} 处替换)')
        
        if len(fixed) > 50:
            print(f'  ... 还有 {len(fixed) - 50} 个文件')
    
    if errors:
        print(f'\n错误的文件:')
        print('-' * 80)
        for r in errors:
            print(f'  [✗] {r["path"]}: {r["status"]}')
    
    # 生成报告
    report_path = Path(BROKEN_DIR).parent / '修复报告.md'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('# src-broken-backup 修复报告\n\n')
        f.write(f'## 统计\n\n')
        f.write(f'- 总文件数: {len(results)}\n')
        f.write(f'- 已修复: {len(fixed)}\n')
        f.write(f'- 无需修复: {len(ok)}\n')
        f.write(f'- 错误: {len(errors)}\n\n')
        f.write('## 已修复的文件\n\n')
        for r in fixed:
            f.write(f'- `{r["path"]}` ({r["replacements"]} 处)\n')
    
    print(f'\n详细报告已保存到: {report_path}')


if __name__ == '__main__':
    main()
