---
name: kotlin-coroutines-expert
description: "Kotlin Coroutines 和 Flow 的专家模式，涵盖结构化并发、错误处理和测试。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Kotlin 协程专家

## 概述

掌握 Kotlin 协程异步编程的指南。涵盖结构化并发、`Flow` 转换、异常处理和测试策略等高级主题。

## 何时使用此技能

- 在 Kotlin 中实现异步操作时使用
- 使用 `Flow` 设计响应式数据流时使用
- 调试协程取消或异常时使用
- 为挂起函数或 Flow 编写单元测试时使用

## 分步指南

### 1. 结构化并发

始终在定义的 `CoroutineScope` 内启动协程。使用 `coroutineScope` 或 `supervisorScope` 来分组并发任务。

```kotlin
suspend fun loadDashboardData(): DashboardData = coroutineScope {
    val userDeferred = async { userRepo.getUser() }
    val settingsDeferred = async { settingsRepo.getSettings() }
    
    DashboardData(
        user = userDeferred.await(),
        settings = settingsDeferred.await()
    )
}
```

### 2. 异常处理

对顶级作用域使用 `CoroutineExceptionHandler`，但在挂起函数内依赖 `try-catch` 进行细粒度控制。

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    println("Caught $exception")
}

viewModelScope.launch(handler) {
    try {
        riskyOperation()
    } catch (e: IOException) {
        // 专门处理网络错误
    }
}
```

### 3. 使用 Flow 的响应式流

对需要保留的状态使用 `StateFlow`，对事件使用 `SharedFlow`。

```kotlin
// Cold Flow (惰性)
val searchResults: Flow<List<Item>> = searchQuery
    .debounce(300)
    .flatMapLatest { query -> searchRepo.search(query) }
    .flowOn(Dispatchers.IO)

// Hot Flow (状态)
val uiState: StateFlow<UiState> = _uiState.asStateFlow()
```

## 示例

### 示例 1: 带错误处理的并行执行

```kotlin
suspend fun fetchDataWithErrorHandling() = supervisorScope {
    val task1 = async { 
        try { api.fetchA() } catch (e: Exception) { null } 
    }
    val task2 = async { api.fetchB() }
    
    // 如果 task2 失败，task1 不会被取消，因为使用了 supervisorScope
    val result1 = task1.await()
    val result2 = task2.await() // 可能抛出异常
}
```

## 最佳实践

- ✅ **应该做:** 对阻塞 I/O 操作使用 `Dispatchers.IO`
- ✅ **应该做:** 当不再需要时取消作用域（例如 `ViewModel.onCleared`）
- ✅ **应该做:** 对协程单元测试使用 `TestScope` 和 `runTest`
- ❌ **不要做:** 使用 `GlobalScope`。它会破坏结构化并发并可能导致内存泄漏
- ❌ **不要做:** 捕获 `CancellationException`，除非重新抛出它

## 故障排除

**问题:** 协程测试挂起或不可预测地失败。
**解决方案:** 确保使用 `runTest` 并将 `TestDispatcher` 注入到您的类中，以便控制虚拟时间。

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能
- 不要将输出视为特定环境验证、测试或专家评审的替代品
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清
