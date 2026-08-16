# 测试覆盖率 (Test Coverage)

分析测试覆盖率（Test Coverage），识别覆盖缺口，并补全缺失的测试以达到 80% 以上的覆盖率。

## 步骤 1：检测测试框架 (Test Framework)

| 指标 (Indicator) | 覆盖率命令 (Coverage Command) |
|-----------|-----------------|
| `jest.config.*` 或 `package.json` 中的 jest | `npx jest --coverage --coverageReporters=json-summary` |
| `vitest.config.*` | `npx vitest run --coverage` |
| `pytest.ini` / `pyproject.toml` 中的 pytest | `pytest --cov=src --cov-report=json` |
| `Cargo.toml` | `cargo llvm-cov --json` |
| 包含 JaCoCo 的 `pom.xml` | `mvn test jacoco:report` |
| `go.mod` | `go test -coverprofile=coverage.out ./...` |

## 步骤 2：分析覆盖率报告 (Coverage Report)

1. 运行覆盖率命令
2. 解析输出结果（JSON 摘要或终端输出）
3. 列出 **覆盖率低于 80%** 的文件，按覆盖率从低到高排序
4. 针对每个覆盖不足的文件，识别以下内容：
   - 未测试的函数或方法
   - 缺失的分支覆盖（if/else、switch、错误路径）
   - 导致分母虚高的死代码（Dead Code）

## 步骤 3：生成缺失的测试

针对每个覆盖不足的文件，按以下优先级生成测试：

1. **正常路径 (Happy Path)** —— 使用有效输入的中心功能
2. **错误处理 (Error Handling)** —— 无效输入、缺失数据、网络故障
3. **边界情况 (Edge Cases)** —— 空数组、null/undefined、边界值 (0, -1, MAX_INT)
4. **分支覆盖 (Branch Coverage)** —— 每个 if/else、switch 分支、三元运算符

### 测试生成规则

- 测试文件需与源码相邻：`foo.ts` → `foo.test.ts`（或遵循项目惯例）
- 使用项目现有的测试模式（导入风格、断言库、Mock 方案）
- 对外部依赖进行 Mock（数据库、API、文件系统）
- 每个测试应保持独立 —— 测试之间不共享可变状态
- 采用描述性命名：`test_create_user_with_duplicate_email_returns_409`

## 步骤 4：验证 (Verify)

1. 运行完整测试套件 —— 所有测试必须通过
2. 重新运行覆盖率检查 —— 验证改进效果
3. 如果仍低于 80%，对剩余缺口重复步骤 3

## 步骤 5：报告 (Report)

显示前后对比：

```
Coverage Report
──────────────────────────────
File                   Before  After
src/services/auth.ts   45%     88%
src/utils/validation.ts 32%    82%
──────────────────────────────
Overall:               67%     84%  ✅
```

## 重点关注领域

- 具有复杂分支的函数（高圈复杂度）
- 错误处理程序和 catch 代码块
- 在整个代码库中使用的工具函数
- API 接口处理程序（请求 → 响应流）
- 边界情况：null、undefined、空字符串、空数组、零、负数
