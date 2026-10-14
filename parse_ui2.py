import re
data = open('D:/doge-code/ui2.xml', encoding='utf-8').read()
# 找到所有带 text 的节点，并按 bounds 的 y 排序输出
rows = []
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    y1 = int(m.group(3))
    if t.strip():
        rows.append((y1, t))
rows.sort()
for y, t in rows:
    print(f"{y:5d}  {t}")
