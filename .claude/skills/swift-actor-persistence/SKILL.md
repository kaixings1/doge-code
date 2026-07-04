---
name: swift-actor-persistence
description: Swift 中使用 actor 实现的线程安全数据持久化 —— 结合内存缓存与文件存储，从设计上消除数据竞争。
origin: ECC
---

# 使用 Swift Actors 实现线程安全持久化 (Swift Actors for Thread-Safe Persistence)

使用 Swift actor 构建线程安全数据持久化层的模式。该模式结合了内存缓存（In-memory caching）与基于文件的存储，利用 actor 模型（Actor model）在编译时消除数据竞争（Data races）。

## 何时启用

- 在 Swift 5.5+ 中构建数据持久化层
- 需要对共享可变状态（Shared mutable state）进行线程安全访问
- 希望消除手动同步操作（如 locks、DispatchQueues）
- 构建具有本地存储的离线优先（Offline-first）应用

## 核心模式 (Core Pattern)

### 基于 Actor 的仓库模式 (Actor-Based Repository)

Actor 模型保证了序列化访问（Serialized access）—— 由编译器强制执行，确保不会出现数据竞争。

```swift
public actor LocalRepository<T: Codable & Identifiable> where T.ID == String {
    private var cache: [String: T] = [:]
    private let fileURL: URL

    public init(directory: URL = .documentsDirectory, filename: String = "data.json") {
        self.fileURL = directory.appendingPathComponent(filename)
        // 在 init 期间同步加载（此时 actor 隔离尚未生效）
        self.cache = Self.loadSynchronously(from: fileURL)
    }

    // MARK: - 公共 API

    public func save(_ item: T) throws {
        cache[item.id] = item
        try persistToFile()
    }

    public func delete(_ id: String) throws {
        cache[id] = nil
        try persistToFile()
    }

    public func find(by id: String) -> T? {
        cache[id]
    }

    public func loadAll() -> [T] {
        Array(cache.values)
    }

    // MARK: - 私有方法

    private func persistToFile() throws {
        let data = try JSONEncoder().encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }

    private static func loadSynchronously(from url: URL) -> [String: T] {
        guard let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([T].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
    }
}
```

### 使用方法 (Usage)

由于 actor 隔离（Actor isolation），所有调用都会自动变为异步：

```swift
let repository = LocalRepository<Question>()

// 读取 —— 从内存缓存中进行快速 O(1) 查找
let question = await repository.find(by: "q-001")
let allQuestions = await repository.loadAll()

// 写入 —— 原子化地更新缓存并持久化到文件
try await repository.save(newQuestion)
try await repository.delete("q-001")
```

### 结合 @Observable ViewModel

```swift
@Observable
final class QuestionListViewModel {
    private(set) var questions: [Question] = []
    private let repository: LocalRepository<Question>

    init(repository: LocalRepository<Question> = LocalRepository()) {
        self.repository = repository
    }

    func load() async {
        questions = await repository.loadAll()
    }

    func add(_ question: Question) async throws {
        try await repository.save(question)
        questions = await repository.loadAll()
    }
}
```

## 关键设计决策 (Key Design Decisions)

| 决策 | 理由 |