# Windows Driver Kit (WDK) Development

Xmake supports building Windows drivers using WDK (Windows Driver Kit).

## Configuration

```bash
$ xmake f --wdk="G:\Program Files\Windows Kits\10" -c
$ xmake
```

Xmake will detect WDK automatically.

## Driver Types

### KMDF Driver

```lua
target("echo")
    add_rules("wdk.driver", "wdk.env.kmdf")
    add_files("driver/*.c")
    add_files("driver/*.inx")
    add_includedirs("exe")
```

### UMDF Driver

```lua
target("app")
    add_rules("wdk.binary", "wdk.env.umdf")
    add_files("exe/*.cpp")
```

### WDM Driver

```lua
target("wdm_driver")
    add_rules("wdk.driver", "wdk.env.wdm")
    add_files("driver/*.c")
```

## Static and Shared Libraries

```lua
target("mylib")
    add_rules("wdk.static", "wdk.env.kmdf")
    add_files("driver/*.c")

target("myshared")
    add_rules("wdk.shared", "wdk.env.wdm")
    add_files("driver/*.c")
```

## TraceWPP

Enable tracewpp for logging:

```lua
target("driver")
    add_rules("wdk.driver", "wdk.env.kmdf")
    add_values("wdk.tracewpp.flags", 
        "-func:TraceEvents(LEVEL,FLAGS,MSG,...)", 
        "-func:Hexdump((LEVEL,FLAGS,MSG,...))")
    add_files("driver/*.c", {rules = "wdk.tracewpp"})
```

## MANIFEST Tools

```lua
target("kcs")
    add_rules("wdk.driver", "wdk.env.wdm")
    add_values("wdk.man.flags", "-prefix Kcs")
    add_values("wdk.man.resource", "kcsCounters.rc")
    add_values("wdk.man.header", "kcsCounters.h")
    add_values("wdk.man.counter_header", "kcsCounters_counters.h")
```

## Driver Signing

### Test Signing

Install test certificate first (run once as admin):

```bash
$ xmake l utils.wdk.testcert install
```

Then enable in xmake.lua:

```lua
target("driver")
    add_rules("wdk.driver", "wdk.env.wdm")
    set_values("wdk.sign.mode", "test")
    set_values("wdk.sign.digest_algorithm", "sha256")
```

With custom thumbprint:

```lua
set_values("wdk.sign.mode", "test")
set_values("wdk.sign.thumbprint", "032122545DCAA6167B1ADBE5F7FDF07AE2234AAA")
```

With custom store:

```lua
set_values("wdk.sign.mode", "test")
set_values("wdk.sign.store", "PrivateCertStore")
set_values("wdk.sign.company", "yourcompany(test)")
```

### Release Signing

```lua
target("driver")
    add_rules("wdk.driver", "wdk.env.wdm")
    set_values("wdk.sign.mode", "release")
    set_values("wdk.sign.company", "Your Company")
    set_values("wdk.sign.certfile", "path/to/certificate.cer")
    set_values("wdk.sign.digest_algorithm", "sha256")
```

## Windows Version Targeting

Set minimum Windows version:

```lua
set_values("wdk.env.winver", "win10")
set_values("wdk.env.winver", "win10_rs3")
set_values("wdk.env.winver", "win81")
set_values("wdk.env.winver", "win8")
set_values("wdk.env.winver", "win7")
set_values("wdk.env.winver", "win7_sp1")
set_values("wdk.env.winver", "win7_sp2")
set_values("wdk.env.winver", "win7_sp3")
```

Or via command line:

```bash
$ xmake f --wdk_winver=win10_rs3
```

## Building Driver Package

```bash
$ xmake p
$ xmake p -o outputdir
```

Output includes `.cab` files for distribution.

## Examples

See complete examples at: https://github.com/xmake-io/xmake/tree/master/tests/projects/windows/driver
