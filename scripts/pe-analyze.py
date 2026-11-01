"""PE 静态分析工具：节表、导入表、导出表、字符串、编译特征。

用法:
  python scripts/pe-analyze.py <pe文件> [--strings] [--imports] [--exports] [--sections]
"""
import struct
import sys
import os
import re


def u16(d, o):
    return struct.unpack_from('<H', d, o)[0]


def u32(d, o):
    return struct.unpack_from('<I', d, o)[0]


class PE:
    def __init__(self, path):
        self.path = path
        self.data = open(path, 'rb').read()
        d = self.data
        assert d[:2] == b'MZ', 'not a PE'
        self.e_lfanew = u32(d, 0x3c)
        assert d[self.e_lfanew:self.e_lfanew + 4] == b'PE\0\0', 'no PE sig'
        self.machine = u16(d, self.e_lfanew + 4)
        self.num_sections = u16(d, self.e_lfanew + 6)
        self.opt_size = u16(d, self.e_lfanew + 20)
        self.opt_off = self.e_lfanew + 24
        self.magic = u16(d, self.opt_off)
        self.is64 = self.magic == 0x20b
        self.entry_rva = u32(d, self.opt_off + 16)
        self.image_base = struct.unpack_from('<Q', d, self.opt_off + 24)[0] if self.is64 \
            else u32(d, self.opt_off + 28)
        self.dd_off = self.opt_off + (112 if self.is64 else 96)
        self.sections = []
        sec_off = self.opt_off + self.opt_size
        for i in range(self.num_sections):
            s = sec_off + i * 40
            if s + 40 > len(d):
                break
            self.sections.append({
                'name': d[s:s + 8].rstrip(b'\0').decode('latin1', 'replace'),
                'vsize': u32(d, s + 8),
                'vaddr': u32(d, s + 12),
                'rawsize': u32(d, s + 16),
                'rawptr': u32(d, s + 20),
                'chars': u32(d, s + 36),
            })

    def rva2off(self, rva):
        for s in self.sections:
            if s['vaddr'] <= rva < s['vaddr'] + max(s['vsize'], s['rawsize']):
                return s['rawptr'] + (rva - s['vaddr'])
        return None

    def data_dir(self, idx):
        if self.dd_off + idx * 8 + 8 > len(self.data):
            return 0, 0
        return u32(self.data, self.dd_off + idx * 8), u32(self.data, self.dd_off + idx * 8 + 4)

    def read_cstr(self, off):
        end = off
        while end < len(self.data) and self.data[end] != 0:
            end += 1
        return self.data[off:end].decode('latin1', 'replace')

    def imports(self):
        rva, size = self.data_dir(1)
        if not rva:
            return {}
        off = self.rva2off(rva)
        if off is None:
            return {}
        result = {}
        p = off
        while p + 20 <= len(self.data):
            name_rva = u32(self.data, p + 12)
            if name_rva == 0:
                break
            noff = self.rva2off(name_rva)
            if noff:
                dll = self.read_cstr(noff)
                funcs = []
                thunk = u32(self.data, p) or u32(self.data, p + 16)
                toff = self.rva2off(thunk) if thunk else None
                step = 8 if self.is64 else 4
                if toff:
                    i = 0
                    while toff + i * step + step <= len(self.data):
                        v = struct.unpack_from('<Q' if self.is64 else '<I',
                                               self.data, toff + i * step)[0]
                        if v == 0:
                            break
                        if v & (1 << 63 if self.is64 else 1 << 31):
                            funcs.append('#ord_%d' % (v & 0xffff))
                        else:
                            e = self.rva2off(v & 0x7fffffff) if self.is64 else self.rva2off(v)
                            if e:
                                f = self.read_cstr(e + 2)
                                funcs.append(f)
                        i += 1
                result[dll] = funcs
            p += 20
        return result

    def strings(self, minlen=5):
        d = self.data
        out = []
        cur = bytearray()
        start = 0
        for i, b in enumerate(d):
            if 32 <= b < 127:
                if not cur:
                    start = i
                cur.append(b)
            else:
                if len(cur) >= minlen:
                    out.append((start, cur.decode('latin1')))
                cur = bytearray()
        return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    path = sys.argv[1]
    pe = PE(path)
    print('=== %s ===' % path)
    print('size=%d  machine=0x%04x  PE32+ = %s  entry_rva=0x%x  image_base=0x%x'
          % (len(pe.data), pe.machine, pe.is64, pe.entry_rva, pe.image_base))
    print('sections=%d' % len(pe.sections))
    for s in pe.sections:
        print('  %-10s VA=0x%08x VS=0x%08x RAW=0x%08x RS=0x%08x CH=%08x'
              % (s['name'], s['vaddr'], s['vsize'], s['rawptr'], s['rawsize'], s['chars']))
    imps = pe.imports()
    print('\n=== imports (%d dlls) ===' % len(imps))
    for dll, funcs in sorted(imps.items()):
        print('  %s (%d)' % (dll, len(funcs)))
    strs = pe.strings()
    print('\n=== strings: %d total ===' % len(strs))
    if '--strings' in sys.argv:
        for off, s in strs:
            print('  0x%08x  %s' % (off, s))


if __name__ == '__main__':
    main()
