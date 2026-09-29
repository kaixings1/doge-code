import subprocess
import re
from collections import Counter

result = subprocess.run(
    'npx tsc --noEmit --skipLibCheck',
    capture_output=True, text=True, cwd='D:/doge-code'
)

lines = result.stderr.split('\n')
file_counts = Counter()
error_types = Counter()
for line in lines:
    line = line.strip()
    if not line or 'error TS' not in line:
        continue
    m = re.match(r'^(.*?)\(\d+,\d+\): error TS(\d+):', line)
    if m:
        fname = m.group(1)
        tscode = m.group(2)
        file_counts[fname] += 1
        error_types[tscode] += 1

print(f"Total errors: {sum(file_counts.values())}")
print("\n--- Top files ---")
for fname, count in file_counts.most_common(30):
    print(f"{count:3d}  {fname}")

print("\n--- Error types ---")
for code, count in error_types.most_common(20):
    print(f"{count:3d}  TS{code}")
