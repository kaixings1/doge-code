---
name: Spring Boot 服务的 Java 编码规范：命名、不可变性、Option
description: "Spring Boot 服务的 Java 编码规范：命名、不可变性、Optional 使用、流、异常、泛型以及项目布局。"
origin: ECC
---
# Java 编码规范

适用于 Spring Boot 服务中可读、可维护的 Java (17+) 代码规范。

## 何时激活

- 在 Spring Boot 项目中编写或评审 Java 代码时
- 强制执行命名、不可变性或异常处理约定时
- 使用 records、密封类或模式匹配（Java 17+）时
- 评审 Optional、流或泛型的使用时
- 规划包结构和项目布局时

## 核心原则

- **清晰度优先于技巧性** — 代码应易于阅读，而非 clever
- **默认不可变** — 尽量减少共享的可变状态
- **快速失败** — 提供有意义的异常信息
- **保持一致性** — 命名和包结构应遵循统一约定

## 命名

- **类名**：PascalCase，名词或名词短语（如 `UserService`、`OrderRepository`）
- **方法名**：camelCase，动词或动词短语（如 `findUserById()`、`calculateTotal()`）
- **常量**：UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`）
- **包名**：全小写，点分隔（如 `com.example.project.service`）
- **泛型参数**：单大写字母（如 `T`、`E`、`K`、`V`）

**反面模式**：
```java
// 糟糕：缩写或不清晰的名称
public List<Usr> getUsrs() { }

// 推荐：清晰完整
public List<User> getUsers() { }
```

## 不可变性

- 优先使用 `record`（Java 17+）定义数据传输对象
- 使用 `final` 字段防止重新赋值
- 集合参数使用不可变集合（`List.of()`、`Map.of()`）
- 避免公开可变内部状态

```java
// 推荐：不可变数据类
public record UserRequest(String name, String email) {}

// 推荐：不可变集合参数
public void processUsers(List<String> userIds) {
    List<String> immutableIds = List.copyOf(userIds);
}
```

## Optional 使用

- 不要返回 `null`，使用 `Optional<T>` 明确表达"可能为空"
- 不要用 `Optional` 作为字段或方法参数
- 使用 `orElseThrow()` 强制处理空值情况

```java
// 推荐
public Optional<User> findUserById(String id) { }

// 调用方必须处理空值
User user = repository.findUserById(id)
    .orElseThrow(() -> new UserNotFoundException(id));

// 避免：不要这样做
public Optional<Optional<User>> findUser(String id) { } // 嵌套 Optional 禁止
```

## 流最佳实践

- 保持链式调用可读，避免过深嵌套
- 使用有意义的变量名而非纯 lambda
- 优先使用方法引用（`User::getName`）
- 串行流用于简单转换，并行流用于大数据集

```java
// 推荐：清晰可读
List<String> names = users.stream()
    .filter(User::isActive)
    .map(User::getName)
    .sorted()
    .toList();

// 避免：深嵌套和魔法值
users.stream().filter(u -> u.getAge() > 18 && u.getStatus().equals("ACTIVE")).map(u -> u.getName()).toList();
```

## 异常处理

- 不要吞掉异常（空的 catch 块）
- 使用特定异常类型，不要滥用 `Exception`
- 提供有意义的错误消息
- 使用 `try-with-resources` 管理资源

```java
// 推荐
try (Connection conn = dataSource.getConnection()) {
    // 使用连接
} catch (SQLException e) {
    throw new DataAccessException("连接数据库失败", e);
}

// 避免：吞掉异常
try {
    // ...
} catch (Exception e) { }
```

## 泛型与类型安全

- 优先使用泛型集合而非原始类型（`List<String>` 而非 `List`）
- 避免类型转换，使用泛型保证类型安全
- 使用 `? extends` 和 `? super` 限定通配符

```java
// 推荐：类型安全
public <T> List<T> filter(List<? extends T> list, Predicate<T> predicate) { }

// 避免：原始类型和强制转换
public List filter(List list, Predicate predicate) {
    return (List) list.stream().filter(predicate).toList();
}
```

## 项目结构

```
com.example.project/
├── config/          # 配置类（DataSource、Security 等）
├── controller/      # REST 控制器
├── service/         # 业务逻辑接口和实现
├── repository/      # 数据访问层
├── model/           # JPA 实体
├── dto/             # 数据传输对象
├── exception/       # 自定义异常和处理器
├── util/            # 工具类（保持最小化）
└── ProjectApplication.java
```

## 格式与风格

- 使用 4 空格缩进（不要用 tab）
- IDE 使用 Google Java Format 或 Spring 代码风格
- 一行不超过 120 字符
- 大括号换行与 K&R 风格一致

## 应避免的代码异味

- **过长方法**：拆分超过 30 行的方法
- **过长参数列表**：使用 Builder 或 DTO 封装
- **重复代码**：提取到工具方法或模板方法
- **深层嵌套**：使用 guard clauses 提前返回
- **魔术数字/字符串**：提取为命名常量

## 日志记录

- 使用 SLF4J 而非 `System.out.println`
- 适当使用日志级别：DEBUG（调试）、INFO（追踪）、WARN（警告）、ERROR（错误）
- 日志消息应包含上下文（如用户 ID、订单号）
- 使用占位符 `{}` 而非字符串拼接

```java
// 推荐
log.info("用户 {} 创建了订单 {}", userId, orderId);

// 避免
log.info("用户" + userId + "创建了订单" + orderId);
```

## 空值处理

- 方法参数使用 `@NonNull` / `@Nullable` 注解
- 优先使用 `Optional` 表达可空返回值
- 不要返回暴露的内部可变数组/集合

## 测试期望

- 遵循 AAA 模式：Arrange（准备）、Act（执行）、Assert（断言）
- 测试应有描述性的名称
- 使用 `@ParameterizedTest` 进行数据驱动测试
- 每个测试验证一个行为
