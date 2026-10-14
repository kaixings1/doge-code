import re
data = open('D:/doge-code/ui_now.xml', encoding='utf-8').read()
targets = {'会话', '对话', '设置', '已连接', '已断开，重连中…'}
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    x1, y1, x2, y2 = map(int, m.groups()[1:5])
    if t in targets:
        print(t, (x1 + x2) // 2, (y1 + y2) // 2)
