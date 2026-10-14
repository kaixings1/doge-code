import re
data = open('D:/doge-code/ui.xml', encoding='utf-8').read()
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    x1, y1, x2, y2 = map(int, m.groups()[1:5])
    if t in ('会话', '对话', '设置'):
        print(t, (x1 + x2) // 2, (y1 + y2) // 2)
