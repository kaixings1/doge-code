对代码库应用安全加固措施。

## 步骤

### 1. HTTP 安全头
在 Web 服务器或中间件配置中添加或验证以下标头：
- `Content-Security-Policy`：限制脚本来源，禁用内联脚本。
- `Strict-Transport-Security`：`max-age=31536000; includeSubDomains`。
- `X-Content-Type-Options`：`nosniff`。
- `X-Frame-Options`：`DENY` 或 `SAMEORIGIN`。
- `Referrer-Policy`：`strict-origin-when-cross-origin`。
- `Permissions-Policy`：禁用未使用的浏览器功能（摄像头、麦克风、地理位置）。

### 2. 速率限制
- 向认证端点添加速率限制（每分钟 5 次尝试）。
- 向公共 API 端点添加速率限制（每个 IP 每分钟 100 次请求）。
- 对重复失败实施指数退避。
- 使用滑动窗口计数器，而非固定窗口。

### 3. 输入验证
- 向所有 API 端点添加模式验证（Zod、Joi、Pydantic）。
- 清理 HTML 输出以防止 XSS：使用 DOMPurify 或等效工具。
- 验证文件上传的类型、大小和名称。
- 实施请求体大小限制。

### 4. 输出编码
- 确保所有用户提供的数据在渲染到 HTML、SQL、shell 命令或日志之前进行转义。
- 对所有数据库操作使用参数化查询。
- 使用默认启用自动转义的模板引擎。
- 在包含到日志消息之前清理数据以防止日志注入。

### 5. 认证加固
- 强制执行最低密码复杂度（12+ 字符，无常见密码）。
- 在重复失败后实施账户锁定。
- 如果未存在，添加多因素认证支持。
- 设置安全的 cookie 属性：`HttpOnly`、`Secure`、`SameSite=Strict`。
- 在登出时实施适当的会话失效。

### 6. 依赖加固
- 在生产环境中固定确切的依赖版本。
- 启用自动化依赖更新（Dependabot、Renovate）。
- 移除未使用的依赖。
- 在 CI 中使用 `npm ci` 而非 `npm install`。

## 规则

- 增量应用加固。每次更改后测试。
- 不要破坏现有功能。安全措施应对合法用户透明。
- 记录任何需要在部署时更改配置的加固措施。
- 尽可能使用自动化测试验证加固（例如，测试速率限制返回 429）。
