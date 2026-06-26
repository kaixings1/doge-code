# Advanced Build Features

This reference covers advanced xmake build optimization features.

## Build Cache Acceleration

Enable build cache to speed up compilation:

```bash
xmake --ccache
```

Or enable via configuration:

```bash
xmake f --ccache=y
```

### Policy Configuration

```lua
-- Disable ccache for specific target
add_policies("build.ccache:false")
```

## Distributed Compilation

### Setup Remote Server

```bash
xmake service --start
```

### Connect to Remote

```bash
xmake --host=192.168.1.100 --port=9090
```

### Policy Configuration

```lua
-- Only use remote for compilation
add_policies("build.distcc.remote_only")

-- Enable distributed compilation
add_policies("build.distcc")
```

## Remote Compilation

### Start Remote Service

```bash
xmake service --start
```

### Connect to Remote Server

```bash
xmake f --remote=192.168.1.100:9090
xmake
```

### Remote Toolchain

Use remote toolchain for cross-compilation:

```bash
xmake f -p cross --remote=/path/to/toolchain --sdk=/path/to/sdk
```

See: `references/remote-toolchain.md`

## Unity Build

Combine multiple source files into single compilation unit:

```lua
add_rules("utils.unity_build")

target("myapp")
    add_files("src/*.c", {unity = true})
```

### Unity Build Options

```lua
-- Set unity build size
add_rules("utils.unity_build", {size = 32})

-- Disable unity for specific files
add_files("src/special.c", {unity = false})
```

See: `references/unity-build.md`

## Performance Optimization

### Parallel Build

```bash
xmake -j8
```

### Build Mode

```lua
add_rules("mode.release")

target("myapp")
    set_optimize("fastest")  -- -O3 optimization
    set_strip("all")         -- strip symbols
```

### LTO (Link-Time Optimization)

```lua
add_policies("build.optimization.lto")
```

### Sanitizers

```lua
-- Address sanitizer
add_policies("build.sanitizer.address")

-- Undefined behavior sanitizer  
add_policies("build.sanitizer.undefined")

-- Thread sanitizer
add_policies("build.sanitizer.thread")

-- Memory sanitizer
add_policies("build.sanitizer.memory")
```

## Precompiled Headers

See: `references/precompiled-headers.md`

## Linker Optimization

### Link Order

```bash
xmake f --linkorder
```

### LTO with ThinLTO

```bash
xmake f --lto=thin
```

## Best Practices

1. Enable ccache for repeated builds
2. Use distributed compilation for large projects
3. Use unity build for faster compilation
4. Enable LTO for optimized release builds
5. Use parallel builds (-j flag)
