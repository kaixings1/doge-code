# Package Management

Xmake has a built-in package management system that handles dependency discovery, compilation, and integration.

## Basic Usage

### Declaring Dependencies

Use `add_requires()` to declare packages needed by your project:

```lua
add_requires("tbox 1.8.*", "libpng ~1.16", "zlib")
```

### Binding Packages to Targets

Use `add_packages()` to bind declared packages to specific targets:

```lua
add_requires("tbox", "libpng", "zlib")

target("foo")
    set_kind("binary")
    add_files("src/*.c")
    add_packages("tbox", "libpng")

target("bar")
    set_kind("binary")
    add_files("src/*.c")
    add_packages("zlib")
```

## Version Specifications

```lua
-- Specific version
add_requires("tbox 1.8.0")

-- Version range
add_requires("tbox 1.8.*")    -- 1.8.0 to 1.8.x
add_requires("tbox ~1.8")      -- 1.8.0 to 1.9.x
add_requires("tbox >=1.7")     -- 1.7.0 and above

-- Branch or commit
add_requires("tbox master")
add_requires("tbox 7a3b5c2")
```

## Package Options

### Optional Packages

```lua
add_requires("foo", {optional = true})
target("bar")
    add_packages("foo")  -- won't fail if missing
```

### Disable System Library

```lua
add_requires("foo", {system = false})  -- always use xmake's version
```

### Package Aliases

```lua
add_requires("foo", {alias = "myfoo"})
add_packages("myfoo")
```

### Platform/Architecture Limitation

```lua
add_requires("foo", {plat = "windows", arch = "x64"})
add_requires("bar", {plat = "android", arch = "arm64-v8a"})
```

### Package Configurations

```lua
-- Pass configs to a package
add_requires("tbox", {configs = {small = true}})

-- Pass configs to dependencies
add_requireconfs("spdlog.fmt", {configs = {header_only = true}})
```

## Package Instance APIs

Available in custom rules, after_install, etc.:

```lua
package:name()              -- get package name
package:version_str()       -- get version string
package:installdir()       -- get install directory
package:get("links")       -- get link libraries
package:get("includedirs") -- get include directories
package:get("defines")     -- get defines
```

## Local Packages

Create a local package repository:

```
local-repo/
  packages/
    foo/
      xmake.lua
```

```lua
add_repositories("myrepo local-repo")
add_requires("foo")
```

## Finding Packages from CMake

Xmake can find packages using CMake's find_package:

```bash
xmake l find_package cmake::ZLIB
xmake l find_package cmake::LibXml2
```

This uses CMake's ecosystem to find system libraries.

## Package Information

Query package information:

```bash
xmake require --info pkgname
```

## Using xrepo CLI

```bash
xrepo install zlib                    # Install package
xrepo install -p android zlib         # Install for Android
xrepo search zlib                     # Search packages
xrepo remove zlib                     # Remove package
```

## Best Practices

1. Use `add_requires()` for declaration, `add_packages()` for binding
2. Use `{optional = true}` for truly optional dependencies
3. Use `add_requireconfs()` for configuring transitive dependencies
4. Specify platform/arch when needed for cross-compilation
5. Use `xmake require --info` to query available package configurations
