import re
from collections import Counter
with open('D:/doge-code/tsc-stderr.txt','r',encoding='utf-8') as f:
    lines=f.readlines()
fc=Counter()
et=Counter()
for line in lines:
    line=line.strip()
    if not line or 'error TS' not in line:
        continue
    m=re.match(r'^(.*?)\(\d+,\d+\): error TS(\d+):', line)
    if m:
        fc[m.group(1)]+=1
        et[m.group(2)]+=1
print('Total:',sum(fc.values()))
print('--- Top 20 files ---')
for f,c in fc.most_common(20):
    print(f'{c:3d} {f}')
print('--- Error types ---')
for t,c in et.most_common(12):
    print(f'{c:>3}  TS{t}')
