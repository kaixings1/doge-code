---
description: 针对内存安全、现代 C++ 惯用法、并发和安全性的全面 C++ 代码审查。调用 cpp-reviewer 代理。
---

# C++ 代码审查

此命令调用 **cpp-reviewer** 代理进行全面的 C++ 专属代码审查。

## 此命令做什么

1. **识别 C++ 变更**：通过 `git diff` 查找修改过的 `.cpp`、`.hpp`、`.cc`、`.h` 文件
2. **运行静态分析**：执行 `clang-tidy` 和 `cppcheck`
3. **内存安全扫描**：检查裸 new/delete、缓冲区溢出、use-after-free
4. **并发审查**：分析线程安全、互斥锁使用、数据竞争
5. **现代 C++ 检查**：验证代码遵循 C++17/20 约定和最佳实践
6. **生成报告**：按严重程度归类问题

## 何时使用

在以下情况使用 `/cpp-review`：
- 编写或修改 C++ 代码之后
- 提交 C++ 变更之前
- 审查包含 C++ 代码的拉取请求
- 加入新的 C++ 代码库时
- 检查内存安全问题

## 审查类别

### CRITICAL（必须修复）
- 没有 RAII 的裸 `new`/`delete`
- 缓冲区溢出和 use-after-free
- 没有同步的数据竞争
- 通过 `system()` 的命令注入
- 读取未初始化变量
- 空指针解引用

### HIGH（应当修复）
- 违反 Rule of Five
- 缺少 `std::lock_guard` / `std::scoped_lock`
- 分离线程没有恰当的生命周期管理
- 使用 C 风格转换而非 `static_cast`/`dynamic_cast`
- 缺少 `const` 正确性

### MEDIUM（考虑）
- 不必要的拷贝（按值传递而非 `const&`）
- 已知大小的容器缺少 `reserve()`
- 头文件中使用 `using namespace std;`
- 重要返回值缺少 `[[nodiscard]]`
- 过于复杂的模板元编程

## 运行的自动化检查

```bash
# Static analysis
clang-tidy --checks='*,-llvmlibc-*' src/*.cpp -- -std=c++17

# Additional analysis
cppcheck --enable=all --suppress=missingIncludeSystem src/

# Build with warnings
cmake --build build -- -Wall -Wextra -Wpedantic
```

## 使用示例

```text
User: /cpp-review

Agent:
# C++ Code Review Report

## Files Reviewed
- src/handler/user.cpp (modified)
- src/service/auth.cpp (modified)

## Static Analysis Results
✓ clang-tidy: 2 warnings
✓ cppcheck: No issues

## Issues Found

[CRITICAL] Memory Leak
File: src/service/auth.cpp:45
Issue: Raw `new` without matching `delete`
```cpp
auto* session = new Session(userId);  // Memory leak!
cache[userId] = session;
```
Fix: Use `std::unique_ptr`
```cpp
auto session = std::make_unique<Session>(userId);
cache[userId] = std::move(session);
```

[HIGH] Missing const Reference
File: src/handler/user.cpp:28
Issue: Large object passed by value
```cpp
void processUser(User user) {  // Unnecessary copy
```
Fix: Pass by const reference
```cpp
void processUser(const User& user) {
```

## Summary
- CRITICAL: 1
- HIGH: 1
- MEDIUM: 0

Recommendation: FAIL: Block merge until CRITICAL issue is fixed
```

## 批准标准

| Status | Condition |
|--------|-----------|
| PASS: Approve | 没有 CRITICAL 或 HIGH 问题 |
| WARNING: Warning | 仅有 MEDIUM 问题（谨慎合并） |
| FAIL: Block | 发现 CRITICAL 或 HIGH 问题 |

## 与其他命令的集成

- 先用 `/cpp-test` 确保测试通过
- 如果出现构建错误，使用 `/cpp-build`
- 提交前使用 `/cpp-review`
- 非 C++ 专属的问题使用 `/code-review`

## 相关

- Agent：`agents/cpp-reviewer.md`
- Skills：`skills/cpp-coding-standards/`, `skills/cpp-testing/`
