---
description: 增量修复 C++ 构建错误、CMake 问题和链接器问题。调用 cpp-build-resolver 代理进行最小化、外科手术式的修复。
---

# C++ 构建与修复

此命令调用 **cpp-build-resolver** 代理，以最小改动增量修复 C++ 构建错误。

## 此命令做什么

1. **运行诊断**：执行 `cmake --build`、`clang-tidy`、`cppcheck`
2. **解析错误**：按文件分组并按严重程度排序
3. **增量修复**：一次一个错误
4. **验证每次修复**：每次改动后重新运行构建
5. **报告摘要**：显示已修复和剩余的问题

## 何时使用

在以下情况使用 `/cpp-build`：
- `cmake --build build` 失败并报错
- 链接器错误（未定义引用、多重定义）
- 模板实例化失败
- include/依赖问题
- 拉取变更后构建被破坏

## 运行的诊断命令

```bash
# CMake configure
cmake -B build -S .

# Build
cmake --build build 2>&1 | head -100

# Static analysis (if available)
clang-tidy src/*.cpp -- -std=c++17
cppcheck --enable=all src/
```

## 会话示例

```text
User: /cpp-build

Agent:
# C++ Build Resolution

## Initial Diagnostics

```bash
$ cmake --build build
src/service/user.cpp:25:15: error: use of undeclared identifier 'UserRepository'
src/handler/api.cpp:42:9: error: no matching function for call to 'process'
src/handler/api.cpp:58:1: error: non-void function does not return a value
```

Errors found: 3

## Fix 1: Undeclared Identifier

File: src/service/user.cpp:25
Error: use of undeclared identifier 'UserRepository'
Cause: Missing include

```cpp
// Added include
#include "repository/user_repository.hpp"
```

```bash
$ cmake --build build
# 2 errors remaining
```

## Fix 2: No Matching Function

File: src/handler/api.cpp:42
Error: no matching function for call to 'process'

```cpp
// Changed
process(params.get("count"));
// To
process(std::stoi(params.get("count")));
```

```bash
$ cmake --build build
# 1 error remaining
```

## Fix 3: Missing Return

File: src/handler/api.cpp:58
Error: non-void function does not return a value

```cpp
std::optional<User> getUser(const std::string& id) {
    if (id.empty()) {
        return std::nullopt;
    }
    auto user = findUser(id);
    // Added missing return
    return user;
}
```

```bash
$ cmake --build build
# Build successful!
```

## Final Verification

```bash
$ ctest --test-dir build --output-on-failure
Test project build
    1/5 Test #1: unit_tests ........   Passed    0.02 sec
    2/5 Test #2: integration_tests    Passed    0.15 sec
All tests passed.
```

## Summary

| Metric | Count |
|--------|-------|
| Build errors fixed | 3 |
| Linker errors fixed | 0 |
| Files modified | 2 |
| Remaining issues | 0 |

Build Status: PASS: SUCCESS
```

## 常见错误及修复

| Error | Typical Fix |
|-------|-------------|
| `undeclared identifier` | 添加 `#include` 或修正拼写 |
| `no matching function` | 修正参数类型或添加重载 |
| `undefined reference` | 链接库或添加实现 |
| `multiple definition` | 使用 `inline` 或移到 .cpp |
| `incomplete type` | 用 `#include` 替换前向声明 |
| `no member named X` | 修正成员名或添加 include |
| `cannot convert X to Y` | 添加适当的类型转换 |
| `CMake Error` | 修正 CMakeLists.txt 配置 |

## 修复策略

1. **编译错误优先** - 代码必须先能编译
2. **链接器错误其次** - 解决未定义引用
3. **警告第三** - 用 `-Wall -Wextra` 修复
4. **一次一个修复** - 验证每次改动
5. **最小改动** - 不要重构，只修复

## 停止条件

代理将在以下情况停止并报告：
- 同一错误在 3 次尝试后仍然存在
- 修复引入了更多错误
- 需要架构性改动
- 缺少外部依赖

## 相关命令

- `/cpp-test` - 构建成功后运行测试
- `/cpp-review` - 审查代码质量
- `verification-loop` 技能 - 完整验证循环

## 相关

- Agent：`agents/cpp-build-resolver.md`
- Skill：`skills/cpp-coding-standards/`
