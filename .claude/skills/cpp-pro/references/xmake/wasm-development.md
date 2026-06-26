# WebAssembly (WASM) Development

Xmake supports building WebAssembly programs using Emscripten or WASI toolchains.

## Basic Configuration

### Emscripten Toolchain

```bash
$ xmake f -p wasm
$ xmake
```

This uses the emcc toolchain internally. Ensure emcc is available in your environment.

### WASI Toolchain

```bash
$ xmake f -p wasm --toolchain=wasi
$ xmake
```

Or with a specific WASI SDK:

```bash
$ xmake f -p wasm --toolchain=wasi --sdk=/path/to/wasi-sdk-30.0-x86_64-linux
```

## Qt for WebAssembly

Xmake supports Qt for WASM compilation:

```bash
$ xmake f -p wasm [--qt=~/Qt]
$ xmake
```

The `--qt` parameter is usually auto-detected.

::: tip
Note the version correspondence between Emscripten and Qt SDK. See: https://wiki.qt.io/Qt_for_WebAssembly
:::

## Browser-Based WASM

When compiling for browser, xmake automatically:
- Sets target extension to `.html`
- Outputs `.wasm` files

## Target Configuration

### Executable Targets

```lua
target("wasm_app")
    set_kind("binary")
    add_files("src/*.cpp")
```

### Static Library

```lua
target("wasm_lib")
    set_kind("static")
    add_files("src/*.cpp")
```

### Shared Library

```lua
target("wasm_shared")
    set_kind("shared")
    add_files("src/*.cpp")
```

## Platform-Specific Code

```lua
target("app")
    add_files("src/*.cpp")
    if is_plat("wasm") then
        add_defines("USING_WASM")
    end
```

## Using Emscripten in xmake.lua

```lua
set_toolchains("emcc@emscripten")

target("wasm_app")
    set_kind("binary")
    add_files("src/*.cpp")
```

## Best Practices

1. Ensure Emscripten SDK is installed and in PATH
2. Use WASI toolchain for server-side WASM
3. Check Qt/Emscripten version compatibility for Qt WASM projects
4. Test in actual browser for browser-based targets
