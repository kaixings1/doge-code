"""解析 rabin2 -s 输出的 MSVC 修饰符号，还原命名空间/类/方法结构并统计。

用法:
  python scripts/r2-symbols.py <pe文件> [--top N] [--grep 关键词]
"""
import subprocess
import sys
import re
import os
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

R2BIN = r'D:\tools\radare2\radare2-6.2.4-w64\bin\rabin2.exe'


def demangle(mangled):
    """从 MSVC 修饰名里粗提取 命名空间::类::方法。"""
    s = mangled
    # 去掉返回类型前缀后，抓取所有 @name@ 段
    parts = re.findall(r'@([A-Za-z_][A-Za-z0-9_]*)@', s)
    if not parts:
        return None
    # 去掉尾部标记 QQEAA UEAA 等
    parts = [p for p in parts if not re.fullmatch(r'[QUV]?[EA]{1,4}[A-Z]?', p)]
    return parts


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    path = sys.argv[1]
    top = 40
    kw = None
    for i, a in enumerate(sys.argv):
        if a == '--top' and i + 1 < len(sys.argv):
            top = int(sys.argv[i + 1])
        if a == '--grep' and i + 1 < len(sys.argv):
            kw = sys.argv[i + 1]

    r = subprocess.run([R2BIN, '-s', path], capture_output=True)
    out = r.stdout.decode('utf-8', 'replace')
    rows = []
    for line in out.splitlines():
        if not line.strip() or line.startswith('nth') or line.startswith('---'):
            continue
        cols = line.split()
        if len(cols) < 8:
            continue
        name = cols[7]
        rows.append(name)

    print('total symbols: %d' % len(rows))

    ns_counter = Counter()
    cls_counter = Counter()
    method_counter = Counter()
    parsed = 0
    for name in rows:
        parts = demangle(name)
        if not parts:
            continue
        parsed += 1
        # 最后一段是方法名，前面都是命名空间/类
        if len(parts) >= 2:
            method_counter[parts[0]] += 1
            cls_counter[parts[1]] += 1
        for p in parts[2:]:
            ns_counter[p] += 1
    print('parsed: %d' % parsed)

    print('\n=== 命名空间/外层 (top %d) ===' % top)
    for k, v in ns_counter.most_common(top):
        print('  %-42s %6d' % (k, v))

    print('\n=== 类 (top %d) ===' % top)
    for k, v in cls_counter.most_common(top):
        print('  %-42s %6d' % (k, v))

    print('\n=== 方法名 (top %d) ===' % top)
    for k, v in method_counter.most_common(top):
        print('  %-42s %6d' % (k, v))

    if kw:
        rx = re.compile(kw, re.I)
        print('\n=== grep /%s/ ===' % kw)
        hits = [n for n in rows if rx.search(n)]
        print('matches: %d' % len(hits))
        for n in hits[:60]:
            print('  ' + n)


if __name__ == '__main__':
    main()
