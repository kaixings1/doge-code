使用 Playwright 为关键用户流程生成端到端测试。

## 步骤

### 1. 识别关键流程
- 如果未指定，询问要测试哪个用户流程。
- 常见的关键流程：
  - 身份认证（注册、登录、退出、密码重置）
  - 核心 CRUD 操作（创建、读取、更新、删除）
  - 支付/结账流程
  - 搜索和筛选
  - 页面间导航

### 2. 设置测试结构
```typescript
import { test, expect } from "@playwright/test";

test.describe("功能名称", () => {
  test.beforeEach(async ({ page }) => {
    // 导航到起始点
    // 如果需要，设置所需的认证状态
  });

  test("应完成主路径", async ({ page }) => {
    // 匹配真实用户行为的步骤
  });

  test("应优雅处理错误状态", async ({ page }) => {
    // 验证错误消息和恢复选项
  });
});
```

### 3. 遵循最佳实践编写测试
- 使用用户可见的选择器：`getByRole`、`getByText`、`getByLabel`。
- 除非绝对必要，避免使用 CSS 选择器和 XPath。
- 仅当语义选择器不足时，才添加 `data-testid` 属性。
- 在断言前等待网络请求完成：`page.waitForResponse`。
- 使用 `test.step` 记录多步骤流程，以便生成可读的报告。

### 4. 处理测试数据
- 在 `beforeEach` 中使用 API 调用来设置测试数据（比 UI 更快）。
- 在 `afterEach` 中清理测试数据，或使用隔离的测试数据库。
- 绝不依赖其他测试创建的数据。

### 5. 运行和验证
- 使用 `npx playwright test --headed` 运行以观察执行过程。
- 验证测试在无头模式下能通过 CI。
- 通过运行 3 次检查测试是否不脆弱（flaky）。

## 规则

- 测试用户可见的行为，而非实现细节。
- 每个测试应相互独立并可隔离运行。
- 保持每个测试在 30 秒以内。
- 使用 Playwright 的自动等待而非手动的 `page.waitForTimeout`。
- 在 CI 中配置重试机制，但修复脆弱测试而非依赖重试。
- 在失败时截图以进行调试：`use: { screenshot: "only-on-failure" }`。
