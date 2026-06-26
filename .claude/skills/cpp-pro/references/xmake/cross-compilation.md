# Cross Compilation

Xmake provides comprehensive cross-compilation support with automatic toolchain detection.

## Automatic Toolchain Detection

If your cross-compilation toolchain follows the standard structure:

```
/home/toolchains_sdkdir
  - bin
      - arm-linux-armeabi-gcc
      - arm-linux-armeabi-ld
      - ...
  - lib
  - include
```

Xmake will automatically detect and use it:

```bash
$ xmake f -p cross --sdk=/home/toolchains_sdkdir
$ xmake
```

The `-p cross` specifies cross-compilation mode. You can also use `-p linux` to preserve platform identification in xmake.lua.

## Manual Configuration

### Set Toolchain Bin Directory

```bash
$ xmake f -p cross --sdk=/home/toolchains_sdkdir --bin=/usr/opt/bin
```

### Set Cross Prefix

```bash
$ xmake f -p cross --sdk=/usr/toolsdk --bin=/opt/bin --cross=armv7-linux-
```

### Set Compilers

```bash
$ xmake f -p cross --sdk=/user/toolsdk --cc=armv7-linux-clang --cxx=armv7-linux-clang++
```

### Set Linker

```bash
$ xmake f -p cross --sdk=/usr/toolsdk --ld=armv7-linux-clang++ --sh=armv7-linux-clang++ --ar=armv7-linux-ar
```

- `ld`: executable program linker
- `sh`: shared library linker
- `ar`: static library archiver

### Set Include/Library Paths

```bash
$ xmake f -p cross --sdk=/usr/toolsdk \
    --includedirs=/usr/toolsdk/xxx/include \
    --linkdirs=/usr/toolsdk/xxx/lib \
    --links=pthread
```

Use `:` to separate paths on Linux/macOS, `;` on Windows.

### Set Compilation Flags

```bash
$ xmake f -p cross --sdk=/usr/toolsdk \
    --cflags="-DTEST -I/xxx/xxx" \
    --ldflags="-lpthread"
```

Available flags:
- `cflags`: C compilation parameters
- `cxxflags`: C++ compilation parameters
- `cxflags`: C/C++ compilation parameters
- `asflags`: assembler parameters
- `ldflags`: executable link parameters
- `shflags`: shared library link parameters
- `arflags`: static library generation parameters

## Custom Build Platform

Create custom platform configurations in xmake.lua:

```lua
$ xmake f -p myplat --sdk=/usr/local/arm-xxx-gcc/
```

```lua
-- In xmake.lua
if is_plat("myplat") then
    add_defines("TEST")
end
```

## Example: Platform-Specific Source Files

```lua
-- for dragonfly/freebsd/netbsd/openbsd
if is_plat("dragonfly", "freebsd", "netbsd", "openbsd") then
    add_files("src/unix/bsd-ifaddrs.c")
    add_files("src/unix/freebsd.c")
    add_files("src/unix/kqueue.c")
end

-- for sunos
if is_plat("sunos") then
    add_files("src/unix/no-proctitle.c")
    add_files("src/unix/sunos.c")
    add_defines("__EXTENSIONS_", "_XOPEN_SOURCE=600")
end
```

## Cross-Compilation with TryBuild

Build projects that use other build systems:

```bash
$ xmake f --trybuild=cmake -p cross --sdk=/path/to/toolchain
$ xmake f --trybuild=autotools -p cross --sdk=/path/to/toolchain
$ xmake f --trybuild=make -p cross --sdk=/path/to/toolchain
$ xmake f --trybuild=ninja -p cross --sdk=/path/to/toolchain
```
