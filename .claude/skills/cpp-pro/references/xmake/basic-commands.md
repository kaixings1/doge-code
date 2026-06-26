# Basic Commands

Essential xmake commands for building, running, and managing projects.

## Build Commands

### Build Project

```bash
xmake build
# or simply
xmake
```

### Build Specific Target

```bash
xmake build mytarget
```

### Rebuild (Force)

```bash
xmake -r
xmake --rebuild
```

### Build All Targets (Including default=false)

```bash
xmake build -a
xmake build --all
```

### Build with Verbose Output

```bash
xmake -v
```

Shows complete compiler commands for debugging.

## Configuration Commands

### Configure Project

```bash
xmake f -p linux
xmake f -p windows
xmake f -p android --ndk=/path/to/ndk
xmake f -p wasm
```

### Show Configuration

```bash
xmake f --show
```

### Clean Configuration

```bash
xmake f -c
```

## Run Commands

### Run Target

```bash
xmake run
xmake run mytarget
```

### Run with Arguments

```bash
xmake run --arg1=value --arg2
```

## Test Commands

### Run Tests

```bash
xmake test
xmake test mytest
xmake test target/testname
```

See `references/testing.md` for more details.

## Clean Commands

### Clean Build Artifacts

```bash
xmake -t clean
```

### Clean All

```bash
xmake -t clean -a
```

## Install Commands

### Install Targets

```bash
xmake install
xmake install -o /prefix
```

### Uninstall

```bash
xmake uninstall
```

## Package Commands

### Package Targets

```bash
xmake p
xmake package
```

## Project Commands

### Create Project

```bash
xmake create myproject
xmake create -l c myproject
xmake create -t static myproject
xmake create -t shared myproject
```

## Utility Commands

### Show Version

```bash
xmake -V
xmake --version
```

### Show Help

```bash
xmake -h
xmake --help
```

### Interactive Menu

```bash
xmake f --menu
```

## Common Options

| Option | Description |
|--------|-------------|
| `-j, --jobs` | Number of parallel jobs |
| `-v, --verbose` | Verbose output |
| `-d, --debug` | Debug mode |
| `-m, --mode` | Build mode (debug, release) |
| `-p, --plat` | Target platform |
| `-a, --arch` | Target architecture |

## Examples

### Full Build Cycle

```bash
# Configure
xmake f -p linux -m debug

# Build
xmake -j8

# Run
xmake run

# Test
xmake test

# Package
xmake p -o ./dist
```

### Cross-Compilation

```bash
xmake f -p android --ndk=/opt/android-ndk -a arm64-v8a
xmake -r
```
