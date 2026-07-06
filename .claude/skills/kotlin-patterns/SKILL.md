---
name: kotlin-patterns
description: "Kotlin Patterns — Kotlin Patterns 相关功能和最佳实践"
metadata:
  origin: ECC
---

# Kotlin 开发模式

构建健壮、高效和可维护应用程序的惯用 Kotlin 模式和最佳实践。

## 何时使用

- 编写新的 Kotlin 代码
- 评审 Kotlin 代码
- 重构现有的 Kotlin 代码
- 设计 Kotlin 模块或库
- 配置 Gradle Kotlin DSL 构建

## 工作原理

此技能在七个关键领域强制实施惯用的 Kotlin 约定：使用类型系统和安全调用操作符的空安全、通过数据类的 `val` 和 `copy()` 实现的不可变性、用于详尽类型层次结构的密封类和接口、使用协程和 `Flow` 的结构化并发、用于在不继承的情况下添加行为的扩展函数、使用 `@DslMarker` 和 lambda 接收器的类型安全 DSL 构建器，以及用于构建配置的 Gradle Kotlin DSL。

## 示例

**使用 Elvis 操作符的空安全:**
```kotlin
fun getUserEmail(userId: String): String {
    val user = userRepository.findById(userId)
    return user?.email ?: "unknown@example.com"
}
```

**用于详尽结果的密封类:**
```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Failure(val error: AppError) : Result<Nothing>()
    data object Loading : Result<Nothing>()
}
```

**使用 async/await 的结构化并发:**
```kotlin
suspend fun fetchUserWithPosts(userId: String): UserProfile =
    coroutineScope {
        val user = async { userService.getUser(userId) }
        val posts = async { postService.getUserPosts(userId) }
        UserProfile(user = user.await(), posts = posts.await())
    }
```

## 核心原则

### 1. 空安全

Kotlin 的类型系统区分可空类型和非空类型。充分利用它。

```kotlin
// 好: 默认使用非空类型
fun getUser(id: String): User {
    return userRepository.findById(id)
        ?: throw UserNotFoundException("User $id not found")
}

// 好: 安全调用和 Elvis 操作符
fun getUserEmail(userId: String): String {
    val user = userRepository.findById(userId)
    return user?.email ?: "unknown@example.com"
}

// 不好: 强制解包可空类型
fun getUserEmail(userId: String): String {
    val user = userRepository.findById(userId)
    return user!!.email // 如果为 null 则抛出 NPE
}
```

### 2. 默认不可变性

优先使用 `val` 而不是 `var`，优先使用不可变集合而不是可变集合。

```kotlin
// 好: 不可变数据
data class User(
    val id: String,
    val name: String,
    val email: String,
)

// 好: 使用 copy() 进行转换
fun updateEmail(user: User, newEmail: String): User =
    user.copy(email = newEmail)

// 好: 不可变集合
val users: List<User> = listOf(user1, user2)
val filtered = users.过滤器 { it.email.isNotBlank() }

// 不好: 可变状态
var currentUser: User? = null // 避免可变全局状态
val mutableUsers = mutableListOf<User>() // 除非真正需要，否则避免使用
```

### 3. 表达式体和单表达式函数

使用表达式体实现简洁、可读的函数。

```kotlin
// 好: 表达式体
fun isAdult(age: Int): Boolean = age >= 18

fun formatFullName(first: String, last: String): String =
    "$first $last".trim()

fun User.displayName(): String =
    name.ifBlank { email.substringBefore('@') }

// 好: 作为表达式的 when
fun statusMessage(code: Int): String = when (code) {
    200 -> "OK"
    404 -> "Not Found"
    500 -> "Internal Server Error"
    else -> "Unknown status: $code"
}

// 不好: 不必要的块体
fun isAdult(age: Int): Boolean {
    return age >= 18
}
```

### 4. 用于值对象的数据类

对主要保存数据的类型使用数据类。

```kotlin
// 好: 带有 copy、equals、hashCode、toString 的数据类
data class CreateUserRequest(
    val name: String,
    val email: String,
    val role: Role = Role.USER,
)

// 好: 用于类型安全的值类（运行时零开销）
@JvmInline
value class UserId(val value: String) {
    init {
        require(value.isNotBlank()) { "UserId cannot be blank" }
    }
}

@JvmInline
value class Email(val value: String) {
    init {
        require('@' in value) { "Invalid email: $value" }
    }
}

fun getUser(id: UserId): User = userRepository.findById(id)
```

## Sealed Classes and Interfaces

### Modeling Restricted Hierarchies

```kotlin
// Good: Sealed class for exhaustive when
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Failure(val error: AppError) : Result<Nothing>()
    data object Loading : Result<Nothing>()
}

fun <T> Result<T>.getOrNull(): T? = when (this) {
    is Result.Success -> data
    is Result.Failure -> null
    is Result.Loading -> null
}

fun <T> Result<T>.getOrThrow(): T = when (this) {
    is Result.Success -> data
    is Result.Failure -> throw error.toException()
    is Result.Loading -> throw IllegalStateException("Still loading")
}
```

### Sealed Interfaces for API Responses

```kotlin
sealed interface ApiError {
    val message: String

    data class NotFound(override val message: String) : ApiError
    data class Unauthorized(override val message: String) : ApiError
    data class Validation(
        override val message: String,
        val field: String,
    ) : ApiError
    data class Internal(
        override val message: String,
        val cause: Throwable? = null,
    ) : ApiError
}

fun ApiError.toStatusCode(): Int = when (this) {
    is ApiError.NotFound -> 404
    is ApiError.Unauthorized -> 401
    is ApiError.Validation -> 422
    is ApiError.Internal -> 500
}
```

## Scope Functions

### 使用场景 Each

```kotlin
// let: Transform nullable or scoped result
val length: Int? = name?.let { it.trim().length }

// apply: Configure an object (returns the object)
val user = User().apply {
    name = "Alice"
    email = "alice@example.com"
}

// also: Side effects (returns the object)
val user = createUser(请求).also { logger.info("Created user: ${it.id}") }

// run: Execute a block with receiver (returns result)
val result = connection.run {
    prepareStatement(sql)
    executeQuery()
}

// with: Non-extension form of run
val csv = with(StringBuilder()) {
    appendLine("name,email")
    users.forEach { appendLine("${it.name},${it.email}") }
    toString()
}
```

### Anti-Patterns

```kotlin
// Bad: Nesting scope functions
user?.let { u ->
    u.address?.let { addr ->
        addr.city?.let { city ->
            println(city) // Hard to read
        }
    }
}

// Good: Chain safe calls instead
val city = user?.address?.city
city?.let { println(it) }
```

## Extension Functions

### Adding Functionality Without Inheritance

```kotlin
// Good: Domain-specific extensions
fun String.toSlug(): String =
    lowercase()
        .replace(Regex("[^a-z0-9\\s-]"), "")
        .replace(Regex("\\s+"), "-")
        .trim('-')

fun Instant.toLocalDate(zone: ZoneId = ZoneId.systemDefault()): LocalDate =
    atZone(zone).toLocalDate()

// Good: Collection extensions
fun <T> List<T>.second(): T = this[1]

fun <T> List<T>.secondOrNull(): T? = getOrNull(1)

// Good: Scoped extensions (not polluting global namespace)
class UserService {
    private fun User.isActive(): Boolean =
        status == Status.ACTIVE && lastLogin.isAfter(Instant.now().minus(30, ChronoUnit.DAYS))

    fun getActiveUsers(): List<User> = userRepository.findAll().过滤器 { it.isActive() }
}
```

## Coroutines

### Structured Concurrency

```kotlin
// Good: Structured concurrency with coroutineScope
suspend fun fetchUserWithPosts(userId: String): UserProfile =
    coroutineScope {
        val userDeferred = async { userService.getUser(userId) }
        val postsDeferred = async { postService.getUserPosts(userId) }

        UserProfile(
            user = userDeferred.await(),
            posts = postsDeferred.await(),
        )
    }

// Good: supervisorScope when children can fail independently
suspend fun fetchDashboard(userId: String): Dashboard =
    supervisorScope {
        val user = async { userService.getUser(userId) }
        val notifications = async { notificationService.getRecent(userId) }
        val recommendations = async { recommendationService.getFor(userId) }

        Dashboard(
            user = user.await(),
            notifications = try {
                notifications.await()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emptyList()
            },
            recommendations = try {
                recommendations.await()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emptyList()
            },
        )
    }
```

### Flow for Reactive Streams

```kotlin
// Good: Cold flow with proper error handling
fun observeUsers(): Flow<List<User>> = flow {
    while (currentCoroutineContext().isActive) {
        val users = userRepository.findAll()
        emit(users)
        delay(5.seconds)
    }
}.catch { e ->
    logger.error("Error observing users", e)
    emit(emptyList())
}

// Good: Flow operators
fun searchUsers(查询: Flow<String>): Flow<List<User>> =
    查询
        .debounce(300.milliseconds)
        .distinctUntilChanged()
        .过滤器 { it.length >= 2 }
        .mapLatest { q -> userRepository.search(q) }
        .catch { emit(emptyList()) }
```

### Cancellation and Cleanup

```kotlin
// Good: Respect cancellation
suspend fun processItems(items: List<Item>) {
    items.forEach { item ->
        ensureActive() // Check cancellation before expensive work
        processItem(item)
    }
}

// Good: Cleanup with try/finally
suspend fun acquireAndProcess() {
    val resource = acquireResource()
    try {
        resource.process()
    } finally {
        withContext(NonCancellable) {
            resource.release() // Always release, even on cancellation
        }
    }
}
```

## Delegation

### Property Delegation

```kotlin
// Lazy initialization
val expensiveData: List<User> by lazy {
    userRepository.findAll()
}

// Observable property
var name: String by Delegates.observable("initial") { _, old, new ->
    logger.info("Name changed from '$old' to '$new'")
}

// Map-backed properties
class Config(private val map: Map<String, Any?>) {
    val host: String by map
    val port: Int by map
    val debug: Boolean by map
}

val config = Config(mapOf("host" to "localhost", "port" to 8080, "debug" to true))
```

### Interface Delegation

```kotlin
// Good: Delegate interface implementation
class LoggingUserRepository(
    private val delegate: UserRepository,
    private val logger: Logger,
) : UserRepository by delegate {
    // Only override what you need to add logging to
    override suspend fun findById(id: String): User? {
        logger.info("Finding user by id: $id")
        return delegate.findById(id).also {
            logger.info("Found user: ${it?.name ?: "null"}")
        }
    }
}
```

## DSL Builders

### Type-Safe Builders

```kotlin
// Good: DSL with @DslMarker
@DslMarker
annotation class HtmlDsl

@HtmlDsl
class HTML {
    private val children = mutableListOf<Element>()

    fun head(init: Head.() -> Unit) {
        children += Head().apply(init)
    }

    fun body(init: Body.() -> Unit) {
        children += Body().apply(init)
    }

    override fun toString(): String = children.joinToString("\n")
}

fun html(init: HTML.() -> Unit): HTML = HTML().apply(init)

// Usage
val page = html {
    head { title("My Page") }
    body {
        h1("Welcome")
        p("Hello, World!")
    }
}
```

### 配置 DSL

```kotlin
data class ServerConfig(
    val host: String = "0.0.0.0",
    val port: Int = 8080,
    val ssl: SslConfig? = null,
    val database: DatabaseConfig? = null,
)

data class SslConfig(val certPath: String, val keyPath: String)
data class DatabaseConfig(val url: String, val maxPoolSize: Int = 10)

class ServerConfigBuilder {
    var host: String = "0.0.0.0"
    var port: Int = 8080
    private var ssl: SslConfig? = null
    private var database: DatabaseConfig? = null

    fun ssl(certPath: String, keyPath: String) {
        ssl = SslConfig(certPath, keyPath)
    }

    fun database(url: String, maxPoolSize: Int = 10) {
        database = DatabaseConfig(url, maxPoolSize)
    }

    fun build(): ServerConfig = ServerConfig(host, port, ssl, database)
}

fun serverConfig(init: ServerConfigBuilder.() -> Unit): ServerConfig =
    ServerConfigBuilder().apply(init).build()

// Usage
val config = serverConfig {
    host = "0.0.0.0"
    port = 443
    ssl("/certs/cert.pem", "/certs/key.pem")
    database("jdbc:postgresql://localhost:5432/mydb", maxPoolSize = 20)
}
```

## Sequences for Lazy Evaluation

```kotlin
// Good: Use sequences for large collections with multiple operations
val result = users.asSequence()
    .过滤器 { it.isActive }
    .map { it.email }
    .过滤器 { it.endsWith("@company.com") }
    .take(10)
    .toList()

// Good: Generate infinite sequences
val fibonacci: Sequence<Long> = sequence {
    var a = 0L
    var b = 1L
    while (true) {
        yield(a)
        val next = a + b
        a = b
        b = next
    }
}

val first20 = fibonacci.take(20).toList()
```

## Gradle Kotlin DSL

### build.gradle.kts 配置

```kotlin
// Check for latest versions: https://kotlinlang.org/docs/releases.html
plugins {
    kotlin("jvm") version "2.3.10"
    kotlin("plugin.serialization") version "2.3.10"
    id("io.ktor.plugin") version "3.4.0"
    id("org.jetbrains.kotlinx.kover") version "0.9.7"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

group = "com.example"
version = "1.0.0"

kotlin {
    jvmToolchain(21)
}

dependencies {
    // Ktor
    implementation("io.ktor:ktor-server-core:3.4.0")
    implementation("io.ktor:ktor-server-netty:3.4.0")
    implementation("io.ktor:ktor-server-content-negotiation:3.4.0")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.4.0")

    // Exposed
    implementation("org.jetbrains.exposed:exposed-core:1.0.0")
    implementation("org.jetbrains.exposed:exposed-dao:1.0.0")
    implementation("org.jetbrains.exposed:exposed-jdbc:1.0.0")
    implementation("org.jetbrains.exposed:exposed-kotlin-datetime:1.0.0")

    // Koin
    implementation("io.insert-koin:koin-ktor:4.2.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")

    // Testing
    testImplementation("io.kotest:kotest-runner-junit5:6.1.4")
    testImplementation("io.kotest:kotest-assertions-core:6.1.4")
    testImplementation("io.kotest:kotest-property:6.1.4")
    testImplementation("io.mockk:mockk:1.14.9")
    testImplementation("io.ktor:ktor-server-test-host:3.4.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}

tasks.withType<Test> {
    useJUnitPlatform()
}

detekt {
    config.setFrom(files("config/detekt/detekt.yml"))
    buildUponDefaultConfig = true
}
```

## Error Handling Patterns

### Result Type for Domain Operations

```kotlin
// Good: Use Kotlin's Result or a custom sealed class
suspend fun createUser(请求: CreateUserRequest): Result<User> = runCatching {
    require(请求.name.isNotBlank()) { "Name cannot be blank" }
    require('@' in 请求.email) { "Invalid email format" }

    val user = User(
        id = UserId(UUID.randomUUID().toString()),
        name = 请求.name,
        email = Email(请求.email),
    )
    userRepository.save(user)
    user
}

// Good: Chain results
val displayName = createUser(请求)
    .map { it.name }
    .getOrElse { "Unknown" }
```

### require, check, error

```kotlin
// Good: Preconditions with clear messages
fun withdraw(account: Account, amount: Money): Account {
    require(amount.value > 0) { "Amount must be positive: $amount" }
    check(account.balance >= amount) { "Insufficient balance: ${account.balance} < $amount" }

    return account.copy(balance = account.balance - amount)
}
```

## 集合操作

### 惯用的集合处理

```kotlin
// 好: 链式操作
val activeAdminEmails: List<String> = users
    .过滤器 { it.role == Role.ADMIN && it.isActive }
    .sortedBy { it.name }
    .map { it.email }

// 好: 分组和聚合
val usersByRole: Map<Role, List<User>> = users.groupBy { it.role }

val oldestByRole: Map<Role, User?> = users.groupBy { it.role }
    .mapValues { (_, users) -> users.minByOrNull { it.createdAt } }

// 好: 用于创建映射的 associate
val usersById: Map<UserId, User> = users.associateBy { it.id }

// 好: 用于拆分的 partition
val (active, inactive) = users.partition { it.isActive }
```

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |: Kotlin 惯用语

| 惯用语 | 描述 |
|---|---