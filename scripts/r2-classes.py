"""从 MSVC 修饰符号中提取真实类名（VGL* 前缀）与命名空间。

用法:
  python scripts/r2-classes.py <pe文件> [--grep kw]
"""
import subprocess
import sys
import re
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

R2BIN = r'D:\tools\radare2\radare2-6.2.4-w64\bin\rabin2.exe'

# 从修饰名中抓 VGLxxx / vgxxx 标识符（跳过模板参数噪声）
TOKEN = re.compile(r'[?@](VGL[A-Za-z0-9]+|vgl[A-Za-z0-9_]+|VGS[A-Za-z0-9]+|VGQ[A-Za-z0-9]+)[@]')


def main():
    path = sys.argv[1]
    kw = None
    for i, a in enumerate(sys.argv):
        if a == '--grep' and i + 1 < len(sys.argv):
            kw = sys.argv[i + 1]

    r = subprocess.run([R2BIN, '-s', path], capture_output=True)
    out = r.stdout.decode('utf-8', 'replace')
    names = []
    for line in out.splitlines():
        cols = line.split()
        if len(cols) >= 8 and not line.startswith('nth'):
            names.append(cols[7])

    counter = Counter()
    for n in names:
        for m in TOKEN.finditer(n):
            counter[m.group(1)] += 1

    print('=== VGL/VGS/VGQ 类名 (共 %d 个不同标识符) ===' % len(counter))
    for k, v in counter.most_common(80):
        print('  %-46s %6d' % (k, v))

    if kw:
        rx = re.compile(kw, re.I)
        print('\n=== grep /%s/ ===' % kw)
        hits = [n for n in names if rx.search(n)]
        print('matches: %d' % len(hits))
        for n in hits[:50]:
            print('  ' + n)


if __name__ == '__main__':
    main()
