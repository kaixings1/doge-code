import re
data = open('D:/doge-code/ui_s.xml', encoding='utf-8').read()
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    y1 = int(m.group(3))
    if '已连接' in t or '重连' in t or 'wss' in t:
        print(y1, t[:60])
