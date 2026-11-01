"""提取 PE 文件字符串并按类别过滤。

用法:
  python scripts/pe-strings.py <pe文件> [--grep 关键词] [--min 长度] [--dump 输出文件]
"""
import sys
import re


def u16(d, o):
    return int.from_bytes(d[o:o + 2], 'little')


def u32(d, o):
    return int.from_bytes(d[o:o + 4], 'little')


def extract(data, minlen=5):
    out = []
    cur = bytearray()
    start = 0
    for i, b in enumerate(data):
        if 32 <= b < 127:
            if not cur:
                start = i
            cur.append(b)
        else:
            if len(cur) >= minlen:
                out.append((start, cur.decode('latin1')))
            cur = bytearray()
    if len(cur) >= minlen:
        out.append((start, cur.decode('latin1')))
    return out


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    path = args[0]
    minlen = 5
    pattern = None
    dump = None
    for i, a in enumerate(args):
        if a == '--grep' and i + 1 < len(args):
            pattern = args[i + 1]
        if a == '--min' and i + 1 < len(args):
            minlen = int(args[i + 1])
        if a == '--dump' and i + 1 < len(args):
            dump = args[i + 1]
    data = open(path, 'rb').read()
    items = extract(data, minlen)
    rx = re.compile(pattern, re.I) if pattern else None
    lines = []
    for off, s in items:
        if rx and not rx.search(s):
            continue
        lines.append('0x%08x  %s' % (off, s))
    if dump:
        with open(dump, 'w', encoding='utf-8', errors='replace') as f:
            f.write('\n'.join(lines))
        print('wrote %d lines to %s' % (len(lines), dump))
    else:
        for l in lines:
            print(l)
        print('--- %d strings ---' % len(lines))


if __name__ == '__main__':
    main()
