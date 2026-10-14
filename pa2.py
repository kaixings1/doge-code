import re
data = open('D:/doge-code/a2.xml', encoding='utf-8').read()
out = []
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    x1, y1, x2, y2 = map(int, m.groups()[1:5])
    if t.strip():
        out.append(f"y={y1:5d} x={(x1+x2)//2:4d}  {t}")
open('D:/doge-code/a1txt.txt', 'w', encoding='utf-8').write("\n".join(out))
print("done")
