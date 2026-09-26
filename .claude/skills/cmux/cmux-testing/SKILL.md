---
name: cmux-testing
description: "cmux 的测试规则，涵盖 Swift Testing、测试 target 编译、测试接线以及包/重构校验。在新增或修改测试、触及包/重构代码，或判断 reload.sh 是否足以完成校验时使用。"
---

# cmux 测试

## 回归测试提交策略

为 bug 修复准备的回归测试分两次提交交付，好让 CI 证明该测试确实能抓住这个 bug：

1. 只提交失败的测试，不带修复。CI 变红。
2. 提交修复。CI 变绿。

这样 GitHub PR 的 Commits 标签页就能显示：没有修复时该测试确实会失败。

## 测试接线

`cmuxTests/` 中的测试文件必须接入 `cmux.xcodeproj/project.pbxproj`，并带有匹配的 `PBXFileReference` 与 `PBXSourcesBuildPhase` 条目。若添加 `.swift` 文件时没有这些，Xcode 会静默忽略它：`xcodebuild test -only-testing:cmuxTests/<TestClass>` 与机器人审查都会以 "Executed 0 tests" 通过，因此在真实用户踩到该 bug 之前，缺失接线与一次干净的红/绿回归测试无法区分。该问题在 https://github.com/manaflow-ai/cmux/issues/4529 对照 https://github.com/manaflow-ai/cmux/pull/4536 的过程中被发现。

`workflow-guard-tests` CI 任务会运行 `./scripts/lint-pbxproj-test-wiring.sh`。请通过 Xcode 添加文件（拖入 cmuxTests target），或参照一个已接线的同类文件（如 `cmuxTests/TabManagerUnitTests.swift`）手工编辑 pbxproj 条目。

## 测试质量策略

- 不允许只验证源码文本、方法签名、AST 片段或 grep 式模式的测试。
- 不允许仅仅为了断言某个键、字符串、plist 条目或片段存在，就去读取已入库的元数据或工程文件（`Resources/Info.plist`、`project.pbxproj`、`.xcconfig`、源文件）的测试。
- 测试应通过可执行的路径（单元、集成、e2e、CLI）验证可观察的运行时行为，而非实现形态。
- 对于元数据改动，请验证构建出的应用 bundle，或依赖该元数据的运行时行为。
- 如果某个行为暂时还无法端到端地跑通，先加一个小的运行时接缝或测试夹具，再通过它来测试。
- 如果做不了有意义的行为级或产物级测试，就跳过那个假的回归测试，并如实说明。

## 测试框架

Swift Testing（Swift 6 / Xcode 16）是所有单元测试与集成测试的默认选择：`import Testing`、`@Test`、`@Suite`、`#expect(...)`、`try #require(...)`。除 UI 测试外，不要新写 `import XCTest` 测试。

- **UI 测试继续留在 XCTest/XCUITest 上。** Swift Testing 没有 `XCUIApplication` 集成。`cmuxUITests/` 下的文件继续使用 `XCTestCase`；不要迁移或桥接它们。
- **新的测试 target 从 Swift Testing 起步。** 每个新包的 `Tests/<Name>Tests/` 从第一次提交起就随它一起交付；Xcode 16 会从 `import Testing` 自动识别框架，无需任何 `Package.swift` 配置。
- **参数化测试**使用 `@Test(arguments: [...])`，而不是写重复的方法。
- **并行化。** Swift Testing 默认并行运行测试，包括跨 suite 并行。需要顺序或需要守护共享可变状态的 suite 应使用 `.serialized`，而不是锁或 sleep。
- **标签**通过 `@Test(.tags(.something))` 让 CI 与本地运行可以按需筛选。
- 只有当某次编辑本来就会触及某个既有 XCTest 文件时，才就地迁移它。映射关系见 [references/swift-testing-migration.md](references/swift-testing-migration.md)。

## 测试 target 校验

`reload.sh` 只构建 `cmux` scheme，所以 reload 变绿并不能说明 `cmuxTests`/`cmuxUITests` 是否仍能编译。被移动或改名的符号可能让应用继续构建成功，却破坏测试 target（真实案例：一个 `write(to:atomically:)` 拼写错误和一个被移除的 `TabManager.CommandResult` 只在 `tests` 任务中暴露出来）。在推送包/重构改动之前，请用 `-derivedDataPath /tmp/cmux-<tag>` 构建 `cmux-unit` scheme（若涉及 `cmuxApp`/`AppDelegate` 改动，还要加上 GlobalISel 变通标志），或让 `tests` CI 任务来把关。

## 详细参考

- [references/swift-testing-migration.md](references/swift-testing-migration.md)：XCTest 到 Swift Testing 的转换映射。
- [references/regression-and-quality.md](references/regression-and-quality.md)：判断一个测试是否足够行为级。
- [references/local-vs-ci-validation.md](references/local-vs-ci-validation.md)：在 `reload.sh`、`cmux-unit`、GitHub Actions、E2E/UI 测试与 Python socket 测试之间做选择。
- [references/remote-tmux-sizing-e2e.md](references/remote-tmux-sizing-e2e.md)：remote-tmux 镜像尺寸 UI 测试套件、其 ssh 垫片、`remote.tmux.pane_grids` / `remote.tmux.test_exec` 调试动词，以及实时布局模糊测试夹具。
