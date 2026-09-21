---
description: 强制 C++ 的 TDD 工作流。先写 GoogleTest 测试，再实现。用 gcov/lcov 验证覆盖率。
---

# C++ TDD 命令

此命令对 C++ 代码强制测试驱动开发方法论，使用 GoogleTest/GoogleMock 配合 CMake/CTest。

## 此命令做什么

1. **定义接口**：先搭建类/函数签名骨架
2. **编写测试**：创建全面的 GoogleTest 测试用例（RED）
3. **运行测试**：验证测试因正确的原因而失败
4. **实现代码**：编写通过测试的最小代码（GREEN）
5. **重构**：在保持测试通过的同时改进
6. **检查覆盖率**：确保 80%+ 覆盖率

## 何时使用

在以下情况使用 `/cpp-test`：
- 实现新的 C++ 函数或类
- 为现有代码添加测试覆盖
- 修复 bug（先写失败的测试）
- 构建关键业务逻辑
- 学习 C++ 中的 TDD 工作流

## TDD 循环

```
RED     → Write failing GoogleTest test
GREEN   → Implement minimal code to pass
REFACTOR → Improve code, tests stay green
REPEAT  → Next test case
```

## 会话示例

````
User: /cpp-test I need a function to validate email addresses

Agent:
# TDD Session: Email Validator

## Step 1: Define Interface

```cpp
// validator/email.hpp
#pragma once
#include <string>
#include <expected>

enum class EmailError {
    Empty,
    InvalidFormat
};

std::expected<void, EmailError> validate_email(const std::string& email);
```

## Step 2: Write Tests (RED)

```cpp
// validator/email_test.cpp
#include <gtest/gtest.h>
#include "email.hpp"

TEST(ValidateEmail, AcceptsSimpleEmail) {
    auto result = validate_email("user@example.com");
    EXPECT_TRUE(result.has_value());
}

TEST(ValidateEmail, AcceptsSubdomain) {
    EXPECT_TRUE(validate_email("user@mail.example.com").has_value());
}

TEST(ValidateEmail, AcceptsPlus) {
    EXPECT_TRUE(validate_email("user+tag@example.com").has_value());
}

TEST(ValidateEmail, RejectsEmpty) {
    auto result = validate_email("");
    ASSERT_FALSE(result.has_value());
    EXPECT_EQ(result.error(), EmailError::Empty);
}

TEST(ValidateEmail, RejectsNoAtSign) {
    EXPECT_FALSE(validate_email("userexample.com").has_value());
}

TEST(ValidateEmail, RejectsNoDomain) {
    EXPECT_FALSE(validate_email("user@").has_value());
}

TEST(ValidateEmail, RejectsNoLocalPart) {
    EXPECT_FALSE(validate_email("@example.com").has_value());
}
```

## Step 3: Run Tests - Verify FAIL

```bash
$ cmake --build build && ctest --test-dir build --output-on-failure

1/1 Test #1: email_validator_test .....***Failed
    --- undefined reference to `validate_email`

FAIL
```

✓ 测试如预期失败（未实现）。

## Step 4: Implement Minimal Code (GREEN)

```cpp
// validator/email.cpp
#include "email.hpp"
#include <regex>

std::expected<void, EmailError> validate_email(const std::string& email) {
    if (email.empty()) {
        return std::unexpected(EmailError::Empty);
    }
    static const std::regex pattern(R"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})");
    if (!std::regex_match(email, pattern)) {
        return std::unexpected(EmailError::InvalidFormat);
    }
    return {};
}
```

## Step 5: Run Tests - Verify PASS

```bash
$ cmake --build build && ctest --test-dir build --output-on-failure

1/1 Test #1: email_validator_test .....   Passed    0.01 sec

100% tests passed.
```

✓ 所有测试通过！

## Step 6: Check Coverage

```bash
$ cmake -DCMAKE_CXX_FLAGS="--coverage" -B build && cmake --build build
$ ctest --test-dir build
$ lcov --capture --directory build --output-file coverage.info
$ lcov --list coverage.info

validator/email.cpp     | 100%
```

✓ 覆盖率：100%

## TDD Complete!
````

## 测试模式

### 基础测试
```cpp
TEST(SuiteName, TestName) {
    EXPECT_EQ(add(2, 3), 5);
    EXPECT_NE(result, nullptr);
    EXPECT_TRUE(is_valid);
    EXPECT_THROW(func(), std::invalid_argument);
}
```

### 测试夹具（Fixtures）
```cpp
class DatabaseTest : public ::testing::Test {
protected:
    void SetUp() override { db_ = create_test_db(); }
    void TearDown() override { db_.reset(); }
    std::unique_ptr<Database> db_;
};

TEST_F(DatabaseTest, InsertsRecord) {
    db_->insert("key", "value");
    EXPECT_EQ(db_->get("key"), "value");
}
```

### 参数化测试
```cpp
class PrimeTest : public ::testing::TestWithParam<std::pair<int, bool>> {};

TEST_P(PrimeTest, ChecksPrimality) {
    auto [input, expected] = GetParam();
    EXPECT_EQ(is_prime(input), expected);
}

INSTANTIATE_TEST_SUITE_P(Primes, PrimeTest, ::testing::Values(
    std::make_pair(2, true),
    std::make_pair(4, false),
    std::make_pair(7, true)
));
```

## 覆盖率命令

```bash
# Build with coverage
cmake -DCMAKE_CXX_FLAGS="--coverage" -DCMAKE_EXE_LINKER_FLAGS="--coverage" -B build

# Run tests
cmake --build build && ctest --test-dir build

# Generate coverage report
lcov --capture --directory build --output-file coverage.info
lcov --remove coverage.info '/usr/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage_html
```

## 覆盖率目标

| Code Type | Target |
|-----------|--------|
| 关键业务逻辑 | 100% |
| 公共 API | 90%+ |
| 一般代码 | 80%+ |
| 生成代码 | 排除 |

## TDD 最佳实践

**要做的：**
- **先**写测试，在任何实现之前
- 每次改动后运行测试
- 适当情况下使用 `EXPECT_*`（继续执行）而非 `ASSERT_*`（中止）
- 测试行为，而非实现细节
- 包含边界情况（空、null、最大值、边界条件）

**不要做的：**
- 在测试之前写实现
- 跳过 RED 阶段
- 直接测试私有方法（通过公共 API 测试）
- 在测试中使用 `sleep`
- 忽略不稳定的测试

## 相关命令

- `/cpp-build` - 修复构建错误
- `/cpp-review` - 实现后审查代码
- `verification-loop` 技能 - 运行完整验证循环

## 相关

- Skill：`skills/cpp-testing/`
- Skill：`skills/tdd-workflow/`
