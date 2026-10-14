import re
data = open('D:/doge-code/ui2.xml', encoding='utf-8').read()
rows = []
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    y1 = int(m.group(3))
    if t.strip():
        rows.append((y1, t))
rows.sort()
with open('D:/doge-code/ui2_text.txt', 'w', encoding='utf-8') as f:
    for y, t in rows:
        f.write(f"{y:5d}  {t}\n")
print("done", len(rows))
