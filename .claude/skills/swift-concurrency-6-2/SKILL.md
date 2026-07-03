---
name: swift-concurrency-6-2
description: Swift 6.2 易用的并发（Approachable Concurrency）—— 默认单线程，使用 @concurrent 进行显式后台卸载，针对主执行角色（Main Actor）类型的隔离一致性。
---

# Swift 6.2 易用的并发 (Approachable Concurrency)

采用 Swift 6.2 并发模型的模式：代码默认在单线程运行，并发需显式引入。在不牺牲性能的情况下消除常见的数据竞争（Data-race）错误。

## 何时激活

- 将 Swift 5.x 或 6.0/6.1 项目迁移到 Swift 6.2
- 解决数据竞争安全的编译器错误
- 设计基于 `MainActor` 的应用架构
- 将 CPU 密集型工作卸载到后台线程
- 在 `MainActor` 隔离的类型上实现协议一致性（Protocol conformances）
- 在 Xcode 26 中启用易用的并发（Approachable Concurrency）构建设置

## 核心问题：隐式后台卸载

在 Swift 6.1 及更早版本中，异步函数（Async functions）可能会被隐式卸载到后台线程，即使在看似安全的代码中也会导致数据竞争错误：

```swift
// Swift 6.1: 错误 (ERROR)
@MainActor
final class StickerModel {
    let photoProcessor = PhotoProcessor()

    func extractSticker(_ item: PhotosPickerItem) async throws -> Sticker? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }

        // 错误：发送 'self.photoProcessor' 存在引起数据竞争的风险
        return await photoProcessor.extractSticker(data: data, with: item.itemIdentifier)
    }
}
```

Swift 6.2 修复了这个问题：异步函数默认保留在调用方执行角色（Actor）上。

```swift
// Swift 6.2: 正常 (OK) — 异步保留在 MainActor，无数据竞争
@MainActor
final class StickerModel {
    let photoProcessor = PhotoProcessor()

    func extractSticker(_ item: PhotosPickerItem) async throws -> Sticker? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
        return await photoProcessor.extractSticker(data: data, with: item.itemIdentifier)
    }
}
```

## 核心模式 —— 隔离一致性 (Isolated Conformances)

`MainActor` 类型现在可以安全地遵守非隔离协议：

```swift
protocol Exportable {
    func export()
}

// Swift 6.1: 错误 (ERROR) — 跨入主执行角色隔离的代码
// Swift 6.2: 正常 (OK)，使用隔离一致性
extension StickerModel: @MainActor Exportable {
    func export() {
        photoProcessor.exportAsPNG()
    }
}
```

编译器确保该一致性仅在主执行角色上使用：

```swift
// 正常 (OK) — ImageExporter 也是 @MainActor
@MainActor
struct ImageExporter {
    var items: [any Exportable]

    mutating func add(_ item: StickerModel) {
        items.append(item)  // 安全：相同的执行角色隔离
    }
}

// 错误 (ERROR) — 非隔离上下文不能使用 MainActor 一致性
nonisolated struct ImageExporter {
    var items: [any Exportable]

    mutating func add(_ item: StickerModel) {
        items.append(item)  // 错误：此处无法使用 Main actor 隔离的一致性
    }
}
```

## 核心模式 —— 全局和静态变量

使用 `MainActor` 保护全局/静态状态：

```swift
// Swift 6.1: 错误 (ERROR) — 非 Sendable 类型可能具有共享的可变状态
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // 错误
}

// 修复：添加 @MainActor 注解
@MainActor
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // 正常 (OK)
}
```

### MainActor 默认推断模式

Swift 6.2 引入了一种默认推断 `MainActor` 的模式 —— 无需手动注解：

```swift
// 启用 MainActor 默认推断后：
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // 隐式为 @MainActor
}

final class StickerModel {
    let photoProcessor: PhotoProcessor
    var selection: [PhotosPickerItem]  // 隐式为 @MainActor
}

extension StickerModel: Exportable {  // 隐式为 @MainActor 一致性
    func export() {
        photoProcessor.exportAsPNG()
    }
}
```

此模式为选填项，推荐用于 App、脚本和其他可执行目标。

## 核心模式 —— 使用 @concurrent 进行后台工作

当你需要真正的并行性时，使用 `@concurrent` 显式卸载：

> **重要提示：** 此示例需要“易用的并发”构建设置 —— SE-0466（MainActor 默认隔离）和 SE-0461（默认非隔离且非发送）。启用这些设置后，`extractSticker` 会保留在调用方的执行角色上，从而使可变状态访问变得安全。**如果没有这些设置，此代码将存在数据竞争** —— 编译器会对其报错。

```swift
nonisolated final class PhotoProcessor {
    private var cachedStickers: [String: Sticker] = [:]

    func extractSticker(data: Data, with id: String) async -> Sticker {
        if let sticker = cachedStickers[id] {
            return sticker
        }

        let sticker = await Self.extractSubject(from: data)
        cachedStickers[id] = sticker
        return sticker
    }

    // 将高耗时工作卸载到并发线程池
    @concurrent
    static func extractSubject(from data: Data) async -> Sticker { /* ... */ }
}

// 调用方必须使用 await
let processor = PhotoProcessor()
processedPhotos[item.id] = await processor.extractSticker(data: data, with: item.id)
```

使用 `@concurrent` 的步骤：
1. 将包含类型标记为 `nonisolated`
2. 为函数添加 `@concurrent`
3. 如果尚未异步，则添加 `async`
4. 在调用处添加 `await`

## 关键设计决策

| 决策 | 原理 |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  21 HOURS 59 MINUTES 58 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE