# Project Structure

Xmake supports modular project organization through subdirectories and target visibility.

## Basic Structure

### Simple Project

```
project/
  xmake.lua
  src/
    main.c
```

```lua
target("myapp")
    set_kind("binary")
    add_files("src/*.c")
```

### Medium Project with Modules

```
project/
  xmake.lua
  src/
    main.c
  lib/
    xmake.lua
    foo.c
```

Use `add_subdirs()` to include subdirectories:

```lua
-- Root xmake.lua
add_subdirs("src")
add_subdirs("lib")

target("myapp")
    set_kind("binary")
    add_files("src/main.c")
    add_deps("foo")  -- depends on lib target
```

## Target Types

Set with `set_kind()`:

```lua
target("myapp")
    set_kind("binary")   -- executable
    set_kind("static")   -- static library (.a/.lib)
    set_kind("shared")   -- shared library (.so/.dll)
```

## Visibility and Inheritance

### Target Dependencies

```lua
target("lib")
    set_kind("static")
    add_files("lib/*.c")

target("app")
    set_kind("binary")
    add_files("src/*.c")
    add_deps("lib")  -- app depends on lib
```

### Exporting Include Directories

```lua
target("mylib")
    set_kind("static")
    add_files("src/*.c")
    add_includedirs("include", {public = true})  -- exported to dependents
```

## Include Patterns

### Global Includes

```lua
add_includedirs("include")
add_includedirs("src", {only_for_compiling = true})  -- not exported
```

### Conditional Includes

```lua
if is_plat("windows") then
    add_files("src/win/*.c")
elseif is_plat("android") then
    add_files("src/android/*.c")
end
```

### Architecture-Specific Files

```lua
add_files("src/common/*.c")
if is_arch("arm64-v8a") then
    add_files("src/arm64/*.c")
elseif is_arch("armeabi-v7a") then
    add_files("src/armv7/*.c")
end
```

## Package Integration

```lua
add_requires("zlib", "openssl")

target("app")
    set_kind("binary")
    add_files("src/*.c")
    add_packages("zlib", "openssl")
```

## Best Practices

1. Use `add_subdirs()` for modular projects
2. Use target dependencies (`add_deps`) for build order
3. Use `{public = true}` for exported include directories
4. Separate public and private headers
5. Use platform/architecture detection for conditional compilation
