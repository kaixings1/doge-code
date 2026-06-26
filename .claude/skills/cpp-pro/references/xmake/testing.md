# Testing

Xmake provides a built-in test framework using `xmake test`.

## Basic Configuration

### Adding Test Cases

Use `add_tests` to configure test cases:

```lua
add_rules("mode.debug", "mode.release")

for _, file in ipairs(os.files("src/test_*.cpp")) do
    local name = path.basename(file)
    target(name)
        set_kind("binary")
        set_default(false)
        add_files("src/" .. name .. ".cpp")
        add_tests("default")
        add_tests("args", {runargs = {"foo", "bar"}})
        add_tests("pass_output", {trim_output = true, runargs = "foo", pass_outputs = "hello foo"})
        add_tests("fail_output", {fail_outputs = {"hello2 .*", "hello xmake"}})
end
```

## Running Tests

### Run All Tests

```bash
$ xmake test
```

### Run Specific Test

```bash
$ xmake test targetname/testname
```

### Run Tests by Pattern

```bash
$ xmake test targetname/*
$ xmake test targetname/foo*
```

### Run Tests Across All Targets

```bash
$ xmake test */testname
```

## Test Configuration Options

| Parameter | Description |
|-----------|-------------|
| `runargs` | Test run argument string or array |
| `runenvs` | Test run environment variable table |
| `timeout` | Test timeout in seconds |
| `trim_output` | Whether to trim output whitespace |
| `pass_outputs` | Expected output patterns for test to pass |
| `fail_outputs` | Output patterns that should cause test to fail |
| `build_should_pass` | Test should build successfully |
| `build_should_fail` | Test should fail to build |
| `files` | Additional test files to compile |
| `defines` | Additional defines for test compilation |
| `realtime_output` | Show test output in real-time |

## Examples

### Test with Arguments

```lua
target("mytest")
    set_kind("binary")
    add_files("src/*.cpp")
    add_tests("with_args", {runargs = {"--verbose", "--mode=test"}})
```

### Test with Expected Output

```lua
target("mytest")
    set_kind("binary")
    add_files("src/*.cpp")
    add_tests("output_test", {pass_outputs = ".*success.*", trim_output = true})
```

### Test that Should Fail

```lua
target("mytest")
    set_kind("binary")
    add_files("src/*.cpp")
    add_tests("should_fail", {fail_outputs = ".*error.*"})
```

### Test with Custom Environment

```lua
target("mytest")
    set_kind("binary")
    add_files("src/*.cpp")
    add_tests("env_test", {runenvs = {MY_VAR = "value"}})
```

### Test with Timeout

```lua
target("mytest")
    set_kind("binary")
    add_files("src/*.cpp")
    add_tests("slow_test", {timeout = 60})
```

## CI Integration

### Exit on Failure

```bash
$ xmake test --exit0
```

### Verbose Output for CI

```bash
$ xmake test -v --verbose
```

## Best Practices

1. Use `set_default(false)` for test targets to avoid building them with regular builds
2. Use `pass_outputs` / `fail_outputs` for automated validation
3. Set appropriate timeouts for slow tests
4. Use descriptive test names
5. Group related tests with the same target
