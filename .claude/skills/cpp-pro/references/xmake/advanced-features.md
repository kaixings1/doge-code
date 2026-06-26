# Advanced Features

This reference covers advanced xmake features including job graphs, custom build scripts, and optimization.

## Job Graph (async.jobgraph)

The job graph module provides DAG-based asynchronous job scheduling:

```lua
import("async.jobgraph")

local jobs = jobgraph.new()

-- Add jobs
jobs:add("job/root", function() print("root job") end)
jobs:add("job/child", function() print("child job") end)

-- Add job dependencies
jobs:add_orders("job/child", "job/root")

-- Run jobs
import("async.runjobs")
runjobs("build", jobs, {parallel = 4})
```

### Job Options

```lua
jobs:add("job/name", function(index, total, opt)
    -- build logic
end, {groups = "group1"})  -- assign to group
```

### Jobgraph in Rules

```lua
rule("foo")
    on_build_files(function (target, jobgraph, sourcebatch, opt)
        local group_name = target:name() .. "/buildfiles"
        for _, sourcefile in ipairs(sourcebatch.sourcefiles) do
            local job_name = target:name() .. "/" .. sourcefile
            jobgraph:add(job_name, function(index, total, opt)
                -- build file
            end, {groups = group_name})
        end
        jobgraph:add_orders(other_target:name() .. "/buildfiles", group_name)
    end, {jobgraph = true})
```

## Target Build Hooks

### Lifecycle Order

```
on_load -> after_load -> on_config -> before_build -> on_build -> after_build
```

### on_load

Called when target is loaded:

```lua
target("myapp")
    on_load(function (target)
        target:add("links", "pthread")
    end)
```

### on_build

Called during build:

```lua
target("myapp")
    on_build(function (target)
        print("Building " .. target:name())
    end)
```

### on_build_file

Called for each source file:

```lua
target("myapp")
    on_build_file(function (target, sourcefile, opt)
        print("Building " .. sourcefile)
    end)
```

### on_build_files

Called for batch of source files:

```lua
target("myapp")
    on_build_files(function (target, sourcebatch, opt)
        -- process batch
    end)
```

### before_build / after_build

```lua
target("myapp")
    before_build(function (target)
        print("Before building")
    end)
    after_build(function (target)
        print("After building")
    end)
```

### on_install / on_uninstall

```lua
target("mylib")
    on_install(function (target)
        -- custom install logic
    end)
    on_uninstall(function (target)
        -- custom uninstall logic
    end)
```

## Prepare Phase

Use `on_prepare` for code generation before compilation:

```lua
target("myapp")
    on_prepare(function (target)
        -- generate code
    end)
```

## Parallel Builds

### Job Count

```bash
$ xmake -j8          # 8 parallel jobs
$ xmake -j           # unlimited jobs
```

### Jobgraph Parallelism

```lua
runjobs("build", jobs, {parallel = 8})
```

## Custom Defines and Flags

### Adding Defines

```lua
target("myapp")
    add_defines("MY_DEFINE")
    add_defines("VALUE=42")
```

### Conditional Defines

```lua
if is_plat("windows") then
    add_defines("WIN32")
end
```

### Custom Flags

```lua
target("myapp")
    add_cflags("-Wall", "-Wextra")
    add_cxxflags("-std=c++17")
    add_ldflags("-L/usr/local/lib")
```

## Preprocessor Handling

### Set Preprocessor

```lua
target("myapp")
    add_preprocessor("cpp")
```

## Lua Scripting

### Accessing Target Properties

```lua
on_load(function (target)
    local name = target:name()
    local kind = target:kind()
    local dir = target:scriptdir()
end)
```

### Platform/Architecture Detection

```lua
if is_plat("windows", "linux") then
    -- windows or linux
end

if is_arch("x64", "x86_64") then
    -- 64-bit arch
end
```

## Toolchain Customization

### Custom Toolchain

```lua
toolchain("mytool")
    set_kind("toolchain")
    set_sdkdir("/path/to/sdk")
    
    on_load(function (toolchain)
        toolchain:set_cc("/path/to/cc")
        toolchain:set_cxx("/path/to/c++")
    end)
```

## Optimizations

### Build Modes

```lua
add_rules("mode.debug", "mode.release")

-- Debug: symbols, no optimization
-- Release: optimized, no symbols
```

### Custom Modes

```lua
add_rules("mode.fast")
target("myapp")
    add_rules("mode.fast")
    set_optimize("fastest")
```

## Best Practices

1. Use jobgraph for complex parallel build scenarios
2. Use on_load for target configuration
3. Use on_prepare for code generation
4. Use platform/arch detection for conditional compilation
5. Use appropriate parallel job count for your system
