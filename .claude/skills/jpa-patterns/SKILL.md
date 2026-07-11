---
name: JPA/Hibernate 模式，涵盖 Spring Boot 中的实体设计、关
description: JPA/Hibernate 模式，涵盖 Spring Boot 中的实体设计、关系、查询优化、事务、审计、索引、分页和连接池。
origin: ECC
---
# JPA/Hibernate 模式

用于 Spring Boot 中的数据建模、仓库层实现和性能调优。

## 何时激活

- 设计 JPA 实体和表映射
- 定义关联关系
- 优化查询
- 配置事务、审计或逻辑删除
- 设置分页、排序或自定义 Repository 方法
- 调优连接池或二级缓存

## 实体设计

- 使用 `@Entity` 和 `@Table` 显式指定表名
- 每个实体必须有一个主键（`@Id`，优先用 `Long` 类型）
- 使用 `@Column` 控制字段约束（长度、可空、唯一）
- 优先用 `LocalDate`/`LocalDateTime` 替代 `Date`

```java
@Entity
@Table(name = "users", indexes = {
    @Index(columnList = "email", unique = true)
})
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 200)
    private String email;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // 构造函数、getter/setter
}
```

## 关联关系与防止 N+1 问题

- `@ManyToOne`：多对一，默认 eager fetch，注意性能
- `@OneToMany`：一对多，默认 lazy fetch
- 使用 `@EntityGraph` 或 `JOIN FETCH` 解决 N+1
- 避免在循环中触发懒加载

```java
// 防止 N+1：使用 JOIN FETCH
@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")
Optional<Order> findByIdWithItems(@Param("id") Long id);

// 也可使用 EntityGraph
@EntityGraph(attributePaths = {"items", "customer"})
Optional<Order> findById(Long id);
```

## Repository 模式

- 继承 `JpaRepository<T, ID>` 获得基础 CRUD
- 使用 `@Query` 定义复杂查询
- 用 `@Modifying` 标记更新/删除操作
- Projection 接口用于只读投影

```java
public interface UserRepository extends JpaRepository<User, Long> {
    // 派生查询
    List<User> findByEmailContaining(String email);

    // 自定义查询
    @Query("SELECT u FROM User u WHERE u.createdAt > :since")
    List<User> findRecentUsers(@Param("since") LocalDateTime since);

    // 投影查询
    interface UserSummary {
        String getName();
        String getEmail();
    }

    List<UserSummary> findBy();
}
```

## 事务

- 默认方法运行在事务外
- 使用 `@Transactional` 开启事务
- `@Transactional(readOnly = true)` 优化只读查询
- 传播级别默认 `REQUIRED`，如有需要覆盖

```java
@Service
@RequiredArgsConstructor
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = new Order();
        // ...
        orderRepository.save(order);
        paymentService.process(order); // 同一事务
        return order;
    }
}
```

## 分页

```java
Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
Page<User> users = userRepository.findByActive(true, pageable);
List<User> content = users.getContent();
long total = users.getTotalElements();
```

## 索引与性能

- 高频查询字段添加索引：`@Index(columnList = "email")`
- 复合索引覆盖多列查询：`@Index(columnList = "lastName, firstName")`
- 避免过度索引（影响写入性能）

## 连接池 (HikariCP)

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
```

## 缓存

- 一级缓存：Hibernate Session 级别，自动开启
- 二级缓存：需要额外配置（如 EhCache、Caffeine）
- `@Cacheable` 标注查询结果

## 数据库迁移

- 使用 Flyway 或 Liquibase 管理版本化迁移
- 迁移脚本命名规范：`V001__create_users.sql`
- 禁止在代码中直接修改生产数据库结构

## 测试数据访问

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserRepositoryTest {

    @Autowired
    private UserRepository repo;

    @Test
    void findByEmail_returnsUser() {
        repo.save(new User(null, "test@example.com", "Test"));
        Optional<User> found = repo.findByEmail("test@example.com");
        assertTrue(found.isPresent());
    }
}
```
