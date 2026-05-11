# /test-macos-app

运行最小有意义的 macOS 测试范围，然后按类别解释失败。

## 参数

- `scheme`: Xcode scheme 名称（可选）
- `target`: 测试目标或产品名称（可选）
- `filter`: 测试过滤表达式（可选）
- `configuration`: `Debug` 或 `Release`（可选，默认：`Debug`）

## 工作流程

1. 检测仓库是否使用 `xcodebuild test` 或 `swift test`。
2. 当提供目标或过滤器时，优先进行 focused 测试执行。
3. 将失败归类为编译、断言、崩溃、环境设置或 flake。
4. 总结顶级阻塞问题和最窄的合理后续步骤。

## 限制

- 如果可以进行 focused 重新运行，避免重新运行完整套件。
- 区分构建失败与实际 failing 测试。
- 注意当主机应用设置或模拟器专属测试假设泄露到 macOS 运行时。
