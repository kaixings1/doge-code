---
name: cmux-architecture
description: "cmux 包架构、重构分层、依赖倒置、文件组织、DocC 文档、包设计纪律、可测试性以及 Swift 6 并发规则。在新增或实质性重写 Swift 文件、Swift 包、协调器、服务、仓库或包级公开 API 之前使用。"
---

# cmux 架构

## 包架构

cmux 正在从单一的 app target 迁移为 `Packages/` 下的 Swift 包。每个新包都必须满足：

- **顺手的。** 默认使用 internal 访问级别；只把下游消费者确实会用到的部分设为 `public`。
- **无环的。** 各包构成严格的有向无环图。要共享某个类型，就把它提升到更底层的包，或在消费者中定义协议接缝。每新增一条依赖边，都必须重新确认这张图仍然无环。
- **覆盖完整领域的。** 一个包拥有一个完整领域（设置、外观、工作区、终端、浏览器、命令面板）。`CmuxAppearanceMath` + `CmuxAppearanceTheme` + `CmuxAppearanceSettings` 是 `CmuxAppearance` 内部的文件夹结构，而不是模块结构。边界之所以存在，是因为不止一个消费者需要其中的内容，或者必须存在一条构建/测试接缝。

拿不准时，先从叶子抽起：也就是那个没有任何内部依赖的包。`Packages/` 下已有的包早于这条策略；不要把它们当作设计参考。

把新包接入 `cmux.xcodeproj` 时，需要在 `cmux` 和 `cmux-unit` **两个** target 中都写入显式的 pbxproj 条目。参见 [references/package-boundaries.md](references/package-boundaries.md)。

**分组文件夹。** 每个包在物理上都恰好位于一个分组目录之下：`Packages/Shared/<pkg>`（两个 app 都用）、`Packages/iOS/<pkg>`（仅 iOS）或 `Packages/macOS/<pkg>`（仅 macOS）。`cmux.xcworkspace/contents.xcworkspacedata` 镜像了这种文件夹结构，其中三个分组的容器位置就是这些文件夹，并且每个包目录都作为 FileRef 位于其所属分组的文件夹之下。文件夹是唯一事实来源：要移动一个包，先 `git mv` 该目录，然后运行 `python3 scripts/check-workspace-package-groups.py --write`。跨分组的 `.package(path:)` 依赖使用 `../../<Group>/<Name>`。绝不要手工编辑工作区分组成员关系。CI 会运行 `python3 scripts/check-workspace-package-groups.py --check`，一旦出现偏差就判定失败。

**锁文件。** 不要 gitignore cmux 自有的 `Package.resolved` 文件；SwiftPM 解析结果的变化必须能在 PR diff 中看到。要跟踪根 Xcode 锁文件，以及由独立的 `swift package resolve` / `swift build` / `swift test` 生成的每一个 cmux 自有包内 `Package.resolved`。包内锁文件是该包独立解析结果的唯一事实来源，并且不会被 `cmux.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` 替换。内置的第三方目录可以沿用其上游的忽略策略。CI 会运行 `python3 scripts/check-package-resolved-policy.py`。

**功能开关指的是 PostHog 远程运行时开关。** 除非用户明确要求编译期开关、本地设置或环境变量，否则功能开关都要通过 `CmuxFeatureFlags` 实现，并配上 PostHog key、显式的不可用回退值、注册表元数据、实时更新行为和有针对性的测试。本地覆盖可以支持内部试用，但绝不能成为生产控制面。

## 分层

共五层，依赖只指向下方：

1. **Core（核心）**（`CmuxCore`）：纯 `Sendable` 值、ID、DTO、错误、共享协议接缝。不含 AppKit/SwiftUI/I/O。当两个领域需要同一个类型时，就提升到这里。
2. **Services / infrastructure（服务 / 基础设施）**：实现核心协议、与外部世界打交道的 `actor`（进程/PTY、文件系统、socket、web API、通知、认证）。每个内聚能力一个包。
3. **Domain / state（领域 / 状态）**：`@MainActor @Observable` 模型加上 Coordinator，每个功能领域一个包，拥有该领域的可变状态。范例是 `CmuxSettings`。
4. **UI**：SwiftUI/AppKit 视图，每个领域包对应一个 UI 包，只依赖自己的领域包加上 Core，绝不直接依赖 Service。范例是 `CmuxSettingsUI`。
5. **Executable（可执行文件）**（`cmuxApp` / `AppDelegate`）：极薄的组装垫片，不含业务逻辑。

按意图对每个被抽取出来的实体分类：

- **Coordinator（协调器）**：`@MainActor @Observable` 编排者，负责串联一个用户流程并拥有导航/选中/生命周期状态，调用 Service 和子模型。它本身不做 I/O。
- **Service（服务）**：`actor`（只有 AppKit 主线程 API 强制要求时才用 `@MainActor`），执行一项外部世界能力；对外暴露 `async`/`await` 以及 `AsyncStream`；只持有自己的资源句柄，不持有 UI 状态。
- **Repository（仓库）**：`actor`，在 CRUD 形状的异步方法背后，为一处持久化事实来源（文件、defaults、web API）做中介，返回值类型。先例：`JSONConfigStore`、`UserDefaultsSettingsStore`。

**依赖倒置。** 更底层的包发布协议；具体的 Service/Repository 去实现它们；更高层依赖 `any Protocol`，绝不依赖具体类型，也绝不使用跨模块的存储属性。只允许构造器（`init`）注入：没有全局容器、没有单例、没有 `static let shared`。可执行 app target 是唯一的组装根，也是唯一可以点名具体类型并组装对象图的地方。SwiftUI `Environment` 可以沿视图树向下传递已经构造好的 `@Observable` 模型（`SettingsRuntime` 就是这么做的），但绝不用于 service 接线。

**状态与 SwiftUI。** 领域状态放在 `@MainActor @Observable` 模型中，绝不使用 `ObservableObject`/`@Published`。上帝模型要拆解为由各自领域包拥有、通过持有引用组合起来的内聚子 `@Observable` 子模型；跨领域读取要走只读协议。视图中使用 `@State`（自有）、`@Bindable` 或普通 `let`（传入），或者 `@Environment(M.self)` 加 `.environment(...)`（注入）。绝不使用 `@StateObject` / `@ObservedObject` / `@EnvironmentObject` / `.environmentObject(_:)`。

**可执行 target 边界（要倒置，绝不要绕开）：**

1. `@main` `cmuxApp` 和 `AppDelegate` 作为极薄的组装垫片留在可执行 target 中。这份残留就是预期的终态，不是技术债。
2. 一个类型只能声明在一个模块中，而底层包无法扩展更高层拥有的类型，所以 `AppDelegate+*` / `cmuxApp+*` / `Workspace+*` 扩展不会下移。要把行为抽取成 Coordinator/Service/Repository，让上帝对象持有一个实例，并把该扩展缩减为一行转发。
3. 存储属性无法跨越模块边界。要把上帝模型的状态拆解为由领域包拥有、通过持有引用组合起来的内聚子 `@Observable` 子模型，跨切面读取则放在只读协议背后。

## 文件组织

一个文件一个主要类型，并以该类型命名（`Control.swift`、`LabeledChoice.swift`、`ListControl.swift`，而不是共享一个 `SettingControl.swift`）。这适用于 `Packages/` 下的所有新代码以及所有新的 app-target 文件。

- 只在文件内部使用的琐碎私有辅助函数、嵌套类型和单行扩展可以留在父类型旁边。任何有实质内容的代码都要有独立文件，包括嵌套在另一个文件类型里的 `private final class`。
- 为定义在别处的类型添加一致性的扩展，放在 `TypeName+Conformance.swift` 或 `TypeName+Feature.swift` 中，不要塞进使用它的功能文件里。
- 类型擦除包装器紧挨着被擦除的东西放：`Foo.swift` 与 `AnyFoo.swift`。
- 上帝文件（`ContentView.swift`、`Workspace.swift`、`TabManager.swift`、`cmuxApp.swift`）正是这条规则要阻止的东西。即便文件数变成三倍，一个类型一个文件也是对的。文件数量很便宜；"找不到这个类型"很昂贵。

## 文档

`Packages/` 下新包中的每个 `public` 符号，在编写时就要配上 Swift-DocC 的 `///` 注释。文档是 API 表面的一部分，不是后续工作。

- 第一行是一句话摘要，必须能排在一行内并以句号结尾。任何讨论段落之前都要有一个空的 `///` 行。在带参数或会抛错的 `init` 和 `func` 符号上使用 `- Parameter name:` / `- Returns:` / `- Throws:`。可以用 Markdown。
- 引用符号时用双反引号（`` ``CmuxSetting`` ``）；非符号代码用单反引号（`UserDefaults.standard`）。
- 要写清楚：类型代表什么、何时使用它、每个枚举 case 的含义、init 参数默认值及其理由、属性不变量、方法行为，以及接受哪些泛型 `Value`/`Element` 形状及其原因。
- 非平凡的 API 至少要有一个放在带 `swift` 标注的围栏代码块里的简短示例，最好取自本代码库的真实声明。
- 当意图不明显时，`internal` 和 `private` 符号要写一行 `///`。公开边界才是需要完整覆盖的那一侧。
- 在改变行为或签名的同一次编辑中更新文档注释。文档注释从外部描述契约；行内 `//` 留给不明显的*为什么*。

主 app target 的代码不要求追溯补文档。

## 包设计纪律

- **不要共享单例访问器。** 在持有运行时状态的包类型上写 `static let standard` / `shared` / `default`，就是换个名字的单例。要在 app 启动处构造并注入。`static let` 用于声明（标识符、schema 条目、枚举 case）没问题，用于行为则不行。
- **不要命名空间枚举。** `enum Foo { static func bar() }` 是个假命名空间：没有实例、没有 DI、没有测试接缝。当辅助函数将来可能需要配置时，优先使用通过构造器传入的值类型 struct。
- **不要并行的手工维护注册表。** 当某个列表镜像已声明的条目时（`catalog.all` 镜像存储属性），要用 `Mirror` 反射或宏来派生它。两个事实来源会悄无声息地漂移。
- **优先用编译期不变量而非运行时陷阱。** 针对"程序员错误"情形的 `guard ... else { assertionFailure(...); return default }`，应当编码进类型系统（幻影类型、分离的具体变体）。运行时陷阱在 release 构建中会变成静默回退。
- **不要自由函数。** 顶层 `func` 声明一律禁止，任何可见性都包括，文件作用域的 `private func` 也在内；把功能限定到拥有该职责的实体上。唯一获准的例外是 C API 强制的 `@convention(c)` 蹦床，且需附一行理由。

## 可测试性

添加到 `Packages/` 的每个公开类型都必须能在测试 target 中测试，无需启动 app target、无需引导 AppKit、也不依赖用户的文件系统或 `UserDefaults.standard`。

- `UserDefaults`、`FileManager`、磁盘路径、环境变量和时钟都通过 `init` 参数传入。测试传入限定到该测试的 `UserDefaults(suiteName:)`、一个临时目录 URL、一个固定的 `Date`。
- 任何实现都不得硬编码 `.shared` / `.standard`。
- **不要静态测试钩子。** `nonisolated(unsafe) static var fooForTesting`（或测试换入的任何全局可变覆盖）会跨测试泄漏，而且通常还需要加锁。要用 `init` 上的协议接缝替换它，例如 `init(commandRunner: any CommandRunning = CommandRunner())`。删除静态钩子及其锁是抽取工作的一部分，不是后续任务。
- 优先返回变更后的值并让调用方去持久化，而不是修改全局状态并返回 `Void`。
- 把状态观测暴露为 `AsyncStream`，这样测试可以断言产出的序列，而不是使用只能靠 runloop 空转的 `NotificationCenter` 模式。
- 在包的 `README.md` 或 DocC catalog 中展示测试实例化模式。

如果一个设计难以测试，那它就是错的。要去改构造器参数列表，而不是测试台。

## Swift 6 并发

`Packages/` 下的新代码、新的 app-target 文件以及实质性重写，都要使用 `actor`、`async`/`await`、`AsyncStream`/`AsyncSequence`、`@Observable` 和 `@MainActor`。

**未在 PR 描述中写明理由时禁止使用：**

- **锁**：`NSLock`、`NSRecursiveLock`、`os_unfair_lock`、`OSAllocatedUnfairLock`、`pthread_mutex_t`、`Synchronization.Mutex`、被当作锁用的 `DispatchSemaphore`。持续存在的可变共享状态属于带有 `async` 读写的 `actor`。
- **通过继承 `NSObject` 实现 KVO**，以重写 `observeValue(forKeyPath:...)` 或调用 `addObserver(_:forKeyPath:...)`。请使用 `NotificationCenter.default.notifications(named:)`，或仅在接缝处使用 `NSKeyValueObservation` token API。
- **把 `DispatchQueue` 当作同步原语**（用 `queue.sync { ... }` 串行化可变状态）。队列用于事件投递没问题，但不要用来保护状态。
- **用 Combine 做变更传播**：`@Published`、`ObservableObject`、`PassthroughSubject`/`CurrentValueSubject`、`AnyCancellable`。
- **完成回调式公开 API**（`(Result<T, Error>) -> Void`、`(T?, Error?) -> Void`）。请使用 `async throws -> T`；遗留回调用 `withCheckedContinuation`/`withCheckedThrowingContinuation` 包一层，并且只限定在那一个接缝处。
- **`DispatchQueue.main.async`**。把目标标注为 `@MainActor` 并 `await` 它。
- **用睡眠替代同步**：任何用于轮询条件、在读取前让状态稳定下来，或与回调/动画竞速的 sleep。`DispatchQueue.asyncAfter` 直接禁用（结构上不可取消、不可测试）。
- **把单方法 `actor` 当作互斥锁。** `actor Guard { func claim() -> Bool }` 会迫使同步调用方（`Process` 终止处理器、`DispatchSource` 事件处理器、`withCheckedContinuation` 的恢复竞态）走 `Task { await guard.claim() }`，从而给一个本质上同步的 compare-and-set 引入挂起点、顺序跳转和重入面。请改用锁的豁免条款。

**要求的形式**：可变共享状态放到带有 `async` 访问器和面向观察者的 `AsyncStream` 的 `actor` 中；对 SwiftUI 渲染友好的状态放到 `@Observable @MainActor` 视图模型中，由它订阅该 stream 并投射快照（绝不要从视图代码同步读取 actor 状态）；跨进程和跨线程的不变量通过 actor 隔离来表达；新的公开可观测表面使用 `AsyncStream`/`AsyncSequence`。

**豁免条款**，每一条都要在声明上附一行理由注释，并藏在 `AsyncStream` 或 `actor` 表面之后，使调用方永远看不到它们：

- 用 `DispatchSource.makeFileSystemObjectSource` 做文件监听，用 `makeReadSource`/`makeWriteSource` 做低层 socket I/O（没有 async 原生的替代品）。
- 有界且可取消的 `Clock.sleep`（优先）或 `Task.sleep`，用于本身就是预期行为的真实延迟或截止时间（最短显示时长、自动消失、检查超时）。要用注入的 `Clock` 驱动它，以便测试推进虚拟时间；保存该 `Task`，并在相关的生命周期转换时取消它。绝不要用于轮询、等待状态稳定或竞速。
- `DispatchSource.makeTimerSource`（一次性）仅当真实截止时间必须在任何 async 上下文之外触发时使用，即在没有 `Task` 可承载该 sleep 的非 `async` 类型中。只要代码已经是 async 或 actor 隔离的，就优先用 `Clock.sleep`；裸定时器不集成取消、不可测试，而且有挂起/恢复/取消的坑。
- 在非 async 回调中调用的、短的、非阻塞的同步 compare-and-set 可以使用锁。典型场景：多个同步的 `Process`/`DispatchSource` 回调竞相恢复同一个 `withCheckedContinuation`，且必须恰好恢复一次，此时用 `OSAllocatedUnfairLock(initialState:)` 包一个 `Bool` 来守护。不要用于守护持续存在的领域状态。
- 当包装只通过 KVO 暴露变更的 Foundation/AppKit 类型时，使用 `NSKeyValueObservation` token。

抽取使用被禁原语的既有代码时，要在接缝处重塑它而不是照抄；通常它想要的是一个 `actor`。要在按原始 fd 为键的分离任务上并发排空 `Process` 管道（`Int32` 是 `Sendable`，`FileHandle` 不是）。

`@unchecked Sendable` 和 `nonisolated(unsafe)` 需要一条解释安全性论证的注释，否则 diff 会被拒绝。把 `@unchecked Sendable` 加在整个 actor 或 struct 上几乎总是错的；优先在单个非 Sendable 属性上使用 `nonisolated(unsafe) let`。

既有的 app-target 代码在重写之前可以保留旧原语。不要盲目改造。

## 详细参考

- [references/package-boundaries.md](references/package-boundaries.md)：抽取顺序、依赖图、组装根、pbxproj 接线。
- [references/concurrency-carveouts.md](references/concurrency-carveouts.md)：豁免示例与评审拒绝清单。
- [references/file-api-discipline.md](references/file-api-discipline.md)：一个类型一个文件、DocC、设计坏味道。
