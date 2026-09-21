---
description: 针对惯用模式、空安全、协程安全性和安全性的全面 Kotlin 代码审查。调用 kotlin-reviewer 代理。
---

# Kotlin 代码审查

此命令调用 **kotlin-reviewer** 代理进行全面的 Kotlin 专属代码审查。

## 此命令做什么

1. **识别 Kotlin 变更**：通过 `git diff` 查找修改过的 `.kt` 和 `.kts` 文件
2. **运行构建与静态分析**：执行 `./gradlew build`、`detekt`、`ktlintCheck`
3. **安全扫描**：检查 SQL 注入、命令注入、硬编码密钥
4. **空安全审查**：分析 `!!` 用法、平台类型处理、不安全转换
5. **协程审查**：检查结构化并发、调度器使用、取消
6. **生成报告**：按严重程度归类问题

## 何时使用

在以下情况使用 `/kotlin-review`：
- 编写或修改 Kotlin 代码之后
- 提交 Kotlin 变更之前
- 审查包含 Kotlin 代码的拉取请求
- 加入新的 Kotlin 代码库时
- 学习惯用的 Kotlin 模式

## 审查类别

### CRITICAL（必须修复）
- SQL/命令注入漏洞
- 无正当理由的强制解包 `!!`
- 平台类型空安全违规
- GlobalScope 使用（违反结构化并发）
- 硬编码凭证
- 不安全的反序列化

### HIGH（应当修复）
- 本可用不可变却用了可变状态
- 协程上下文中的阻塞调用
- 长循环中缺少取消检查
- 对 sealed 类型的非穷尽 `when`
- 过大的函数（>50 行）
- 过深的嵌套（>4 层）

### MEDIUM（考虑）
- 非惯用 Kotlin（Java 风格模式）
- 缺少尾随逗号
- 作用域函数误用或嵌套
- 大型集合链缺少 sequence
- 冗余的显式类型

## 运行的自动化检查

```bash
# Build check
./gradlew build

# Static analysis
./gradlew detekt

# Formatting check
./gradlew ktlintCheck

# Tests
./gradlew test
```

## 使用示例

````text
User: /kotlin-review

Agent:
# Kotlin Code Review Report

## Files Reviewed
- src/main/kotlin/com/example/service/UserService.kt (modified)
- src/main/kotlin/com/example/routes/UserRoutes.kt (modified)

## Static Analysis Results
✓ Build: Successful
✓ detekt: No issues
WARNING: ktlint: 2 formatting warnings

## Issues Found

[CRITICAL] Force-Unwrap Null Safety
File: src/main/kotlin/com/example/service/UserService.kt:28
Issue: Using !! on nullable repository result
```kotlin
val user = repository.findById(id)!!  // NPE risk
```
Fix: Use safe call with error handling
```kotlin
val user = repository.findById(id)
    ?: throw UserNotFoundException("User $id not found")
```

[HIGH] GlobalScope Usage
File: src/main/kotlin/com/example/routes/UserRoutes.kt:45
Issue: Using GlobalScope breaks structured concurrency
```kotlin
GlobalScope.launch {
    notificationService.sendWelcome(user)
}
```
Fix: Use the call's coroutine scope
```kotlin
launch {
    notificationService.sendWelcome(user)
}
```

## Summary
- CRITICAL: 1
- HIGH: 1
- MEDIUM: 0

Recommendation: FAIL: Block merge until CRITICAL issue is fixed
````

## 批准标准

| Status | Condition |
|--------|-----------|
| PASS: Approve | 没有 CRITICAL 或 HIGH 问题 |
| WARNING: Warning | 仅有 MEDIUM 问题（谨慎合并） |
| FAIL: Block | 发现 CRITICAL 或 HIGH 问题 |

## 与其他命令的集成

- 先用 `/kotlin-test` 确保测试通过
- 如果出现构建错误，使用 `/kotlin-build`
- 提交前使用 `/kotlin-review`
- 非 Kotlin 专属的问题使用 `/code-review`

## 相关

- Agent：`agents/kotlin-reviewer.md`
- Skills：`skills/kotlin-patterns/`, `skills/kotlin-testing/`
