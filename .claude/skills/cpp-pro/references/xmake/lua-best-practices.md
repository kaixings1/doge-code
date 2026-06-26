# Lua Best Practices for Xmake

This guide covers best practices for organizing and writing maintainable xmake.lua files using Lua.

## Project Structure

### Simple Project

```
project/
  xmake.lua
  src/
    main.c
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
  modules/
    common.lua
```

### Complex Project

```
project/
  xmake.lua
  xmake_modules/
    myrule.lua
  src/
  lib/
  tests/
  docs/
```

## Root Scope vs Target Scope

### Root Scope

Root scope is where you define targets, options, and global settings:

```lua
-- Root scope: global configuration
add_requires("zlib", "openssl")

-- Helper functions in root scope
function is_debug()
    return is_mode("debug")
end

-- Define targets
target("app")
    set_kind("binary")
    add_files("src/*.c")
```

### Target Scope

Target scope is inside target definitions:

```lua
target("myapp")
    set_kind("binary")
    add_files("src/*.c")
    -- Target scope ends here
```

## Declaring Helpers in Root Scope

### Helper Functions

Define reusable functions at root scope:

```lua
-- Helper function at root scope
function add_warnings(target)
    if is_kind("binary") then
        target:add("cflags", "-Wall", "-Wextra")
    end
end

-- Use in target
target("myapp")
    add_warnings(target)
```

### Global Variables

Use root scope for global configuration:

```lua
-- Global at root scope
MY_PROJECT_VERSION = "1.0.0"

target("myapp")
    add_defines("VERSION=\"" .. MY_PROJECT_VERSION .. "\"")
```

## Modularization

### Separate Files with include()

For configuration reuse:

```lua
-- common.lua
function setup_common(target)
    target:add("cflags", "-Wall")
    target:add("defines", "COMMON_DEF")
end

-- xmake.lua
include("common.lua")

target("app")
    add_files("src/*.c")
    setup_common(target)
```

### Using add_subdirs()

For modular projects:

```lua
-- Root xmake.lua
add_subdirs("src")
add_subdirs("lib")
add_subdirs("tests")

-- lib/xmake.lua
target("mylib")
    set_kind("static")
    add_files("*.c")
```

### Custom Modules

Create reusable modules:

```
xmake_modules/
  mymodule.lua
```

```lua
-- xmake_modules/mymodule.lua
function mymodule.add_features(target)
    target:add("cflags", "-O3")
end
```

Use in xmake.lua:

```lua
package("mymodule")
    add_moduledirs("xmake_modules")
    
target("myapp")
    import("mymodule").add_features(target)
```

## Using import()

### Import Modules

```lua
-- In target scripts
on_load(function (target)
    import("core.base.task")
    import("async.runjobs")
end)
```

### Import Package Tools

```lua
package("mypackage")
    on_install(function (package)
        import("package.tools.cmake").install(package, configs)
    end)
```

## Best Practices

### 1. Use Local Variables

Avoid polluting global namespace:

```lua
-- Good
local function my_helper()
end

-- Avoid
function my_helper()  -- pollutes global
end
```

### 2. Group Related Configuration

```lua
-- Group by concern
add_requires("zlib", "openssl")  -- dependencies
add_rules("mode.debug", "mode.release")  -- build modes

target("app")
    set_kind("binary")
    add_files("src/*.c")
    add_packages("zlib", "openssl")
```

### 3. Use Constants

```lua
local CONFIG = {
    VERSION = "1.0.0",
    DEBUG = true,
}

target("myapp")
    add_defines("APP_VERSION=\"" .. CONFIG.VERSION .. "\"")
```

### 4. Separate Platform-Specific Code

```lua
if is_plat("windows") then
    target:add("links", "ws2_32")
elseif is_plat("linux") then
    target:add("links", "pthread")
end
```

### 5. Use Target Dependencies

```lua
target("lib")
    set_kind("static")
    add_files("lib/*.c")

target("app")
    set_kind("binary")
    add_files("src/*.c")
    add_deps("lib")  -- builds lib first
```

### 6. Leverage on_load for Dynamic Configuration

```lua
target("myapp")
    on_load(function (target)
        if target:is_plat("windows") then
            target:add("links", "ws2_32")
        end
    end)
```

### 7. Use Table-Driven Configuration

```lua
local TARGETS = {
    {name = "app", kind = "binary", files = "src/*.c"},
    {name = "lib", kind = "static", files = "lib/*.c"},
}

for _, t in ipairs(TARGETS) do
    target(t.name)
        set_kind(t.kind)
        add_files(t.files)
end
```

### 8. Avoid Duplicate Code with Functions

```lua
-- Define once, use many times
function add_compile_flags(target)
    target:add("cflags", "-Wall", "-Wextra", "-pedantic")
end

target("app")
    add_files("src/*.c")
    add_compile_flags(target)

target("lib")
    add_files("lib/*.c")
    add_compile_flags(target)
```

### 9. Use Script Directory for Paths

```lua
-- Always use relative to current xmake.lua
target("myapp")
    set_kind("binary")
    add_includedirs("include", {rootdir = os.scriptdir()})
    add_files("src/*.c", {rootdir = os.scriptdir()})
```

### 10. Modularize with Package

For reusable components:

```lua
-- mypackage/xmake.lua
package("mypackage")
    add_moduledirs(".")
    on_install(function (package)
        -- build logic
    end)
package_end()
```

## Common Patterns

### Pattern: Optional Features

```lua
option("feature_xyz")
    set_default(false)
    set_description("Enable XYZ feature")

target("myapp")
    add_files("src/*.c")
    add_options("feature_xyz")
    if options("feature_xyz") then
        add_defines("ENABLE_XYZ")
    end
```

### Pattern: Conditional Dependencies

```lua
if is_plat("windows") then
    add_requires("winhttp")
elseif is_plat("linux") then
    add_requires("libcurl")
end
```

### Pattern: Build Mode Configuration

```lua
add_rules("mode.debug", "mode.release")

target("myapp")
    if is_mode("debug") then
        add_defines("DEBUG_MODE")
    end
```

## Anti-Patterns to Avoid

### 1. Don't Define Targets in Functions

```lua
-- Bad
function create_target()
    target("app")  -- Creates new target each call
end

-- Good
target("app")  -- Define once at root scope
    set_kind("binary")
    add_files("src/*.c")
```

### 2. Don't Use Global State

```lua
-- Bad
MY_VAR = "something"
function get_var()
    return MY_VAR  -- depends on global
end

-- Good
function get_var()
    local my_var = "something"  -- local scope
    return my_var
end
```

### 3. Don't Duplicate Configuration

```lua
-- Bad
target("app1")
    add_defines("DEF1")
    add_cflags("-Wall")

target("app2")
    add_defines("DEF1")  -- duplication
    add_cflags("-Wall")

-- Good
function add_common_settings(t)
    t:add_defines("DEF1")
    t:add_cflags("-Wall")
end

target("app1")
    add_files("src/*.c")
    add_common_settings(target)
```
