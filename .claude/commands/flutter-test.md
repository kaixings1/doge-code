---
description: 运行 Flutter/Dart 测试、报告失败并增量修复测试问题。涵盖单元、widget、golden 和集成测试。
---

# Flutter 测试

此命令运行 Flutter 测试套件并报告结果。出现失败时，它诊断并增量修复问题。

## 此命令做什么

1. **运行测试**：执行 `flutter test`（或限定到变更的文件）
2. **解析失败**：按类型和原因识别失败的测试
3. **增量修复**：尽可能一次一个失败
4. **验证**：每次修复后重新运行
5. **报告**：显示覆盖率摘要和剩余失败

## 何时使用

在以下情况使用 `/flutter-test`：
- 实现功能后验证没有东西被破坏
- 运行 `/flutter-build` 之后确保测试通过
- 检查新代码的测试覆盖率
- 当某个特定测试文件失败时
- 提交 PR 之前

## 运行的命令

```bash
# Run all tests
flutter test 2>&1

# Run with coverage
flutter test --coverage 2>&1

# Run specific test file
flutter test test/unit/domain/usecases/get_user_test.dart 2>&1

# Run tests matching a name pattern
flutter test --name "CartBloc" 2>&1

# Run integration tests (requires device/emulator)
flutter test integration_test/ 2>&1

# Update golden files when intentional visual changes are made
flutter test --update-goldens 2>&1
```

## 会话示例

````text
User: /flutter-test

Agent:
# Flutter Test Run

## Test Execution

```
$ flutter test
00:05 +42 -2: Some tests failed.

FAILED: test/unit/data/user_repository_test.dart
  UserRepository getById
    returns null when user not found
    Expected: null
    Actual: User(id: 'test-id', name: 'Test User')

FAILED: test/widget/cart_page_test.dart
  CartPage
    shows empty state when cart is empty
    Expected: exactly one widget with text 'Your cart is empty'
    Found: no widget with text 'Your cart is empty'
```

## Fix 1: Repository Test

File: test/unit/data/user_repository_test.dart
Failure: `getById` returns a user when it should return null for missing ID

根因：测试 setup 添加了一个 ID 为 'test-id' 的用户，但用 'missing-id' 查询。
修复：把测试改为用 'missing-id' 查询 —— setup 是正确的，查询是错的。

```
$ flutter test test/unit/data/user_repository_test.dart
1 test passed.
```

## Fix 2: Widget Test

File: test/widget/cart_page_test.dart
Failure: Empty state text widget not found

根因：空状态提示信息在 widget 中从 'Your cart is empty' 重命名为 'Cart is empty'。
修复：把测试字符串更新为与当前 widget 文案一致。

```
$ flutter test test/widget/cart_page_test.dart
1 test passed.
```

## 最终运行

```
$ flutter test --coverage
All 44 tests passed.
Coverage: 84.2% (target: 80%)
```

## 摘要

| Metric | Value |
|--------|-------|
| Total tests | 44 |
| Passed | 44 |
| Failed | 0 |
| Coverage | 84.2% |

Test Status: PASS ✓
````

## 常见测试失败

| Failure | Typical Fix |
|---------|-------------|
| `Expected: <X> Actual: <Y>` | 更新断言或修复实现 |
| `Widget not found` | 修复 finder 选择器或在 widget 重命名后更新测试 |
| `Golden file not found` | 运行 `flutter test --update-goldens` 生成 |
| `Golden mismatch` | 检查 diff；如果变更是有意的则运行 `--update-goldens` |
| `MissingPluginException` | 在测试 setup 中 mock 平台通道 |
| `LateInitializationError` | 在 `setUp()` 中初始化 `late` 字段 |
| `pumpAndSettle timed out` | 替换为显式的 `pump(Duration)` 调用 |

## 相关命令

- `/flutter-build` — 运行测试前修复构建错误
- `/flutter-review` — 测试通过后审查代码
- `tdd-workflow` 技能 — 测试驱动开发工作流

## 相关

- Agent：`agents/flutter-reviewer.md`
- Agent：`agents/dart-build-resolver.md`
- Skill：`skills/flutter-dart-code-review/`
- Rules：`rules/dart/testing.md`
