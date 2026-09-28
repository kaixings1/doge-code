---
description: 强制 Rust 的 TDD 工作流。先写测试，再实现。用 cargo-llvm-cov 验证 80%+ 覆盖率。
---

# Rust TDD 命令

此命令对 Rust 代码强制测试驱动开发方法论，使用 `#[test]`、rstest、proptest 和 mockall。

## 此命令做什么

1. **定义类型/Trait**：用 `todo!()` 搭建函数签名骨架
2. **编写测试**：创建全面的测试模块（RED）
3. **运行测试**：验证测试因正确的原因而失败
4. **实现代码**：编写通过测试的最小代码（GREEN）
5. **重构**：在保持测试通过的同时改进
6. **检查覆盖率**：用 cargo-llvm-cov 确保 80%+ 覆盖率

## 何时使用

在以下情况使用 `/rust-test`：
- 实现新的 Rust 函数、方法或 trait
- 为现有 Rust 代码添加测试覆盖
- 修复 bug（先写失败的测试）
- 构建关键业务逻辑
- 学习 Rust 中的 TDD 工作流

## TDD 循环

```
RED     -> Write failing test first
GREEN   -> Implement minimal code to pass
REFACTOR -> Improve code, tests stay green
REPEAT  -> Next test case
```

## 会话示例

````text
User: /rust-test I need a function to validate user registration

Agent:
# TDD Session: Registration Validator

## Step 1: Define Interface

```rust
// src/validator.rs
pub struct RegistrationRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

pub enum ValidationResult {
    Valid,
    Invalid(Vec<String>),
}

pub fn validate_registration(request: &RegistrationRequest) -> ValidationResult {
    todo!()
}
```

## Step 2: Write Tests (RED)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_registration_returns_valid() {
        let request = RegistrationRequest {
            name: "Alice".into(),
            email: "alice@example.com".into(),
            password: "SecureP@ss1".into(),
        };
        assert!(matches!(validate_registration(&request), ValidationResult::Valid));
    }

    #[test]
    fn blank_name_returns_invalid() {
        let request = RegistrationRequest {
            name: "".into(),
            email: "alice@example.com".into(),
            password: "SecureP@ss1".into(),
        };
        match validate_registration(&request) {
            ValidationResult::Invalid(errors) => {
                assert!(errors.contains(&"Name is required".to_string()));
            }
            ValidationResult::Valid => panic!("expected Invalid"),
        }
    }

    #[test]
    fn invalid_email_returns_invalid() {
        let request = RegistrationRequest {
            name: "Alice".into(),
            email: "not-an-email".into(),
            password: "SecureP@ss1".into(),
        };
        assert!(matches!(
            validate_registration(&request),
            ValidationResult::Invalid(_)
        ));
    }

    #[test]
    fn short_password_returns_invalid() {
        let request = RegistrationRequest {
            name: "Alice".into(),
            email: "alice@example.com".into(),
            password: "short".into(),
        };
        assert!(matches!(
            validate_registration(&request),
            ValidationResult::Invalid(_)
        ));
    }
}
```

## Step 3: Run Tests — Verify FAIL

```bash
$ cargo test
running 4 tests
test tests::valid_registration_returns_valid ... FAILED (not yet implemented)
test tests::blank_name_returns_invalid ... FAILED
test tests::invalid_email_returns_invalid ... FAILED
test tests::short_password_returns_invalid ... FAILED
```

测试如预期失败（todo! panic）。

## Step 4: Implement Minimal Code (GREEN)

```rust
pub fn validate_registration(request: &RegistrationRequest) -> ValidationResult {
    let mut errors = Vec::new();

    if request.name.trim().is_empty() {
        errors.push("Name is required".into());
    }
    if !request.email.contains('@') {
        errors.push("Invalid email format".into());
    }
    if request.password.len() < 8 {
        errors.push("Password must be at least 8 characters".into());
    }

    if errors.is_empty() {
        ValidationResult::Valid
    } else {
        ValidationResult::Invalid(errors)
    }
}
```

## Step 5: Run Tests — Verify PASS

```bash
$ cargo test
running 4 tests
test tests::valid_registration_returns_valid ... ok
test tests::blank_name_returns_invalid ... ok
test tests::invalid_email_returns_invalid ... ok
test tests::short_password_returns_invalid ... ok

test result: ok. 4 passed; 0 failed
```

所有测试通过！

## Step 6: Check Coverage

```bash
$ cargo llvm-cov
Coverage: 100.0% of lines
```

覆盖率：100%

## TDD Complete!
````

## 测试模式

### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_two_numbers() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn handles_error() -> Result<(), Box<dyn std::error::Error>> {
        let result = parse_config(r#"port = 8080"#)?;
        assert_eq!(result.port, 8080);
        Ok(())
    }
}
```

### 用 rstest 做参数化测试

```rust
use rstest::{rstest, fixture};

#[rstest]
#[case("hello", 5)]
#[case("", 0)]
#[case("rust", 4)]
fn test_string_length(#[case] input: &str, #[case] expected: usize) {
    assert_eq!(input.len(), expected);
}
```

### 异步测试

```rust
#[tokio::test]
async fn fetches_data_successfully() {
    let client = TestClient::new().await;
    let result = client.get("/data").await;
    assert!(result.is_ok());
}
```

### 属性测试（Property-Based）

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn encode_decode_roundtrip(input in ".*") {
        let encoded = encode(&input);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(input, decoded);
    }
}
```

## 覆盖率命令

```bash
# Summary report
cargo llvm-cov

# HTML report
cargo llvm-cov --html

# Fail if below threshold
cargo llvm-cov --fail-under-lines 80

# Run specific test
cargo test test_name

# Run with output
cargo test -- --nocapture

# Run without stopping on first failure
cargo test --no-fail-fast
```

## 覆盖率目标

| Code Type | Target |
|-----------|--------|
| 关键业务逻辑 | 100% |
| 公共 API | 90%+ |
| 一般代码 | 80%+ |
| 生成代码 / FFI 绑定 | 排除 |

## TDD 最佳实践

**要做的：**
- **先**写测试，在任何实现之前
- 每次改动后运行测试
- 用 `assert_eq!` 而非 `assert!`，以获得更好的错误消息
- 在返回 `Result` 的测试中使用 `?`，让输出更干净
- 测试行为，而非实现
- 包含边界情况（空、边界、错误路径）

**不要做的：**
- 在测试之前写实现
- 跳过 RED 阶段
- 当 `Result::is_err()` 可用时使用 `#[should_panic]`
- 在测试中使用 `sleep()` —— 改用 channel 或 `tokio::time::pause()`
- 什么都 mock —— 可行时优先集成测试

## 相关命令

- `/rust-build` - 修复构建错误
- `/rust-review` - 实现后审查代码
- `verification-loop` 技能 - 运行完整验证循环

## 相关

- Skill：`skills/rust-testing/`
- Skill：`skills/rust-patterns/`
