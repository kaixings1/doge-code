#!/usr/bin/env python3
with open('E:/llama.cpp/llama-server-gui/src/app.cpp', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix each issue individually
fixes = [
    ('设置 ssssd', '启用服务器槽位 (--slots)'),
    ('聊天模板 sssdfff', '聊天模板内容'),
    ('ffffd 聊天模板', '跳过聊天解析'),
    ('dddcc 文件:', '模型预设文件:'),
]

for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        print(f'Fixed: {old} -> {new}')
    else:
        print(f'Skipped (not found): {old}')

with open('E:/llama.cpp/llama-server-gui/src/app.cpp', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone!")
