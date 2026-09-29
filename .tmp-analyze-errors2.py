import re
from collections import Counter

with open('D:/doge-code/tsc-errors.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

errors = []
for line in lines:
    line = line.strip()
    if 'error TS' not in line:
        continue
    m = re.match(r'(.+)\((\d+),\d+\): error TS(\d+): (.+)', line)
    if m:
        errors.append((m.group(1), int(m.group(2)), m.group(3), m.group(4)))

print(f"Total errors: {len(errors)}")
by_file = Counter(f for f, _, _, _ in errors)
print("\nTop files:")
for f, c in by_file.most_common(30):
    print(f"  {c:3d} {f}")

msgs = Counter(msg for _, _, _, msg in errors)
print("\nTop messages:")
for msg, c in msgs.most_common(30):
    print(f"  {c:3d} {msg[:120]}")
