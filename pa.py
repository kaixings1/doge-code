import re
data = open('D:/doge-code/a1.xml', encoding='utf-8').read()
# 找 EditText 与全部可点击控件
for m in re.finditer(r'<node[^>]*resource-id="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*>', data):
    rid = m.group(1)
    x1, y1, x2, y2 = map(int, m.groups()[1:5])
    if 'input' in rid.lower() or 'send' in rid.lower() or 'message' in rid.lower():
        print(rid, "center=", (x1 + x2) // 2, (y1 + y2) // 2)
print("---- texts ----")
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data):
    t = m.group(1)
    x1, y1, x2, y2 = map(int, m.groups()[1:5])
    if t.strip():
        print(f"({(x1+x2)//2},{(y1+y2)//2})  {t[:70]}")
