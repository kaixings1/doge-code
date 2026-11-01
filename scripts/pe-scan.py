"""扫描目录下所有 PE 文件，标注是否被 Wibu/VMProtect/Themida 等壳保护。"""
import os
import sys
import struct

SHELL_SIGNS = {
    b'__wibu': 'Wibu CodeMeter',
    b'.vmp': 'VMProtect',
    b'VMP': 'VMProtect',
    b'Themida': 'Themida',
    b'.aspack': 'ASPack',
    b'UPX': 'UPX',
    b'.enigma': 'Enigma',
}

KNOWN_SECTIONS = {b'.text', b'.rdata', b'.data', b'.pdata', b'.rsrc', b'.reloc',
                  b'.tls', b'.bss', b'.idata', b'.edata', b'.tls', b'_RDATA',
                  b'.rodata', b'.textidx', b'IPPCODE', b'.didat', b'.00cfg',
                  b'.gfids', b'.CRT', b'.debug', b'.xdata', b'.pdata'}


def u16(d, o):
    return struct.unpack_from('<H', d, o)[0]


def u32(d, o):
    return struct.unpack_from('<I', d, o)[0]


def analyze(path):
    try:
        d = open(path, 'rb').read()
        if d[:2] != b'MZ':
            return None
        e = u32(d, 0x3c)
        if d[e:e + 4] != b'PE\0\0':
            return None
        nsec = u16(d, e + 6)
        optsz = u16(d, e + 20)
        magic = u16(d, e + 24)
        mach = u16(d, e + 4)
        so = e + 24 + optsz
        secs = []
        for i in range(nsec):
            s = so + i * 40
            if s + 40 > len(d):
                break
            secs.append(d[s:s + 8].rstrip(b'\0'))
        packs = set()
        for name in secs:
            for sig, label in SHELL_SIGNS.items():
                if sig in name:
                    packs.add(label)
            if name not in KNOWN_SECTIONS:
                packs.add('unknown:' + name.decode('latin1', 'replace'))
        return {
            'size': len(d), 'machine': mach, 'nsec': nsec,
            'is64': magic == 0x20b, 'secs': secs, 'packs': sorted(packs),
        }
    except Exception as ex:
        return {'error': str(ex)}


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    rows = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if not os.path.isfile(p):
            continue
        if not name.lower().endswith(('.exe', '.dll')):
            continue
        info = analyze(p)
        if info is None:
            continue
        rows.append((name, info))
    print('%-40s %10s %6s %s' % ('file', 'size', 'bits', 'protection'))
    print('-' * 100)
    for name, info in rows:
        if 'error' in info:
            print('%-40s ERR %s' % (name, info['error']))
            continue
        prot = ', '.join(info['packs']) if info['packs'] else 'CLEAN'
        print('%-40s %10d %6s %s' % (name, info['size'],
                                     'x64' if info['is64'] else 'x86', prot))


if __name__ == '__main__':
    main()
