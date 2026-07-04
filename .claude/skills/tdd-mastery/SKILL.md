---
name: tdd-mastery
description: TDD精通 — 红-绿-重构循环、参数化测试、BDD和覆盖率驱动的测试开发。
---

# TDD 精通

## 核心循环：红-绿-重构

1. **红** - 编写一个定义期望行为的失败测试
2. **绿** - 编写最少的代码使测试通过
3. **重构** - 清理代码同时保持测试为绿

没有先编写失败的测试，绝不编写生产代码。每个循环应耗时 2-10 分钟。

## 测试结构

持续使用 Arrange-Act-Assert（准备-执行-断言）模式：

```
准备（Arrange）：设置测试数据和依赖
执行（Act）：    执行被测试的行为
断言（Assert）： 验证期望的结果
```

测试命名为 `test_<单元>_<场景>_<期望结果>` 或 `it("当<条件>时应<行为>")`。

## Jest / Vitest 模式

```typescript
describe("OrderService", () => {
  it("should apply discount when order exceeds threshold", () => {
    const order = createOrder({ items: [{ price: 150, qty: 1 }] });
    const result = applyDiscount(order, { threshold: 100, percent: 10 });
    expect(result.total).toBe(135);
  });

  it("should throw when applying discount to empty order", () => {
    const order = createOrder({ items: [] });
    expect(() => applyDiscount(order, defaultDiscount)).toThrow(EmptyOrderError);
  });
});
```

使用 `vi.fn()` / `jest.fn()` 进行模拟。优先使用依赖注入而非模块模拟。使用 `beforeEach` 进行共享设置，绝不在测试之间共享可变状态。

## pytest 模式

```python
@pytest.fixture
def db_session():
    session = create_test_session()
    yield session
    session.rollback()

def test_create_user_stores_hashed_password(db_session):
    user = UserService(db_session).create(email="a@b.com", password="secret")
    assert user.password_hash != "secret"
    assert verify_password("secret", user.password_hash)

@pytest.mark.parametrize("input,expected", [
    ("", False),
    ("short", False),
    ("ValidPass1!", True),
])
def test_password_validation(input, expected):
    assert validate_password(input) == expected
```

异常使用 `pytest.raises`。共享测试夹具使用 `conftest.py`。慢速测试标记为 `@pytest.mark.slow`。

## Go 测试模式

```go
func TestParseConfig(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    Config
        wantErr bool
    }{
        {"valid yaml", "port: 8080", Config{Port: 8080}, false},
        {"empty input", "", Config{}, true},
        {"invalid port", "port: -1", Config{}, true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParseConfig([]byte(tt.input))
            if (err != nil) != tt.wantErr {
                t.Errorf("ParseConfig() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !tt.wantErr && got != tt.want {
                t.Errorf("ParseConfig() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

默认使用表驱动测试。测试工具函数中使用 `t.Helper()`。仅当团队已在使用时才使用 `testify/assert`。

## 测试层级

| 层级 | 范围 | 速度 | 依赖 |
|------|------|------|------|
| 单元 | 单个函数/类 | <100ms | 无（全部模拟） |
| 集成 | 模块边界 | <5s | 真实数据库、真实文件系统 |
| E2E | 完整用户流程 | <30s | 全栈 |

比例目标：70% 单元，20% 集成，10% E2E。

## 覆盖率规则

- 在 CI 中强制**最低 80% 行覆盖率**
- 跟踪分支覆盖率，而不仅仅是行覆盖率
- 排除生成的代码、类型定义和配置文件
- 绝不要仅为达到覆盖率数字而编写测试；测试行为

```bash
# Jest/Vitest
vitest run --coverage --coverage.thresholds.lines=80 --coverage.thresholds.branches=75

# pytest
pytest --cov=src --cov-fail-under=80 --cov-branch

# Go
go test -coverprofile=cover.out -coverpkg=./... ./...
go tool cover -func=cover.out
```

## 模拟指南

- 在边界处模拟：HTTP 客户端、数据库、文件系统、时钟
- 绝不模拟被测单元
- 对于仓库，优先使用假实现（内存实现）而非模拟
- 断言行为，而非模拟调用次数
- 使用 `t.Cleanup` / `afterEach` 重置共享模拟

## 要避免的反模式

- 测试实现细节而非行为
- 代码被删除后测试仍通过（同义反复的测试）
- 测试用例之间共享可变状态
- 忽视不稳定的测试而非修复它们
- 直接测试私有方法
- 掩盖意图的巨大测试设置代码
