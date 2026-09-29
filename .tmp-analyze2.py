import re
from collections import Counter

with open('D:/doge-code/tsc-stderr.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

file_counts = Counter()
error_types = Counter()
for line in lines:
    line = line.strip()
    if not line or 'error TS' not in line:
        continue
    m = re.match(r'^(.*?)\(\d+,\d+\): error TS(\d+):', line)
    if m:
        fname = m.group(1)
        code = m.group(2)
        file_counts[fname] += 1
        error_types[code] += 1

print(f"Total errors: {sum(file_counts.values())}")
print("\n=== Top 30 files ===")
for f, c in file_counts.most_common(30):
    print(f"{c:3d}  {f}")

print("\n=== Error types ===")
for c, t in error_types.most_common(15):
    print(f"{c:3d}  TS{t}")
