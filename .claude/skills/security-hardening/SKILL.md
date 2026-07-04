---
name: security-hardening
description: 安全加固 — 涵盖输入验证、认证、标头安全、CSRF和SQL注入防护。
---

# 安全加固

## 输入验证

在边界处验证所有输入。永远不要仅信任客户端验证。

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s'-]+$/),
  age: z.number().int().min(13).max(150),
});

function createUser(req: Request) {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return { status: 400, errors: result.error.flatten().fieldErrors };
  }
  // result.data 已类型化和验证
}
```

规则：
- 在每个输入上验证类型、长度、格式和范围
- 使用白名单而非黑名单（接受已知好的，拒绝其他所有）
- 验证文件上传：检查 MIME 类型、文件扩展名和魔术字节
- 在服务器/代理级别限制请求体大小（例如最大 1MB）

## 输出编码

```typescript
// 防止 XSS：根据上下文编码输出
// HTML 上下文：使用框架自动转义（React 默认如此）
// 永远不要将 dangerouslySetInnerHTML 与用户输入一起使用

// URL 上下文：编码参数
const safeUrl = `/search?q=${encodeURIComponent(userInput)}`;

// JSON 上下文：使用 JSON.stringify（处理转义）
const safeJson = JSON.stringify({ query: userInput });
```

永远不要使用用户输入构造 HTML 字符串。使用启用了自动转义的模板引擎。

## SQL 注入防护

```python
# 永远不要这样做
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# 始终使用参数化查询
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

```typescript
// 永远不要这样做
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// 始终使用参数化查询
db.query("SELECT * FROM users WHERE email = $1", [email]);
```

使用 ORM 或查询构建器。如果编写原始 SQL，始终参数化。

## CSRF 防护

```typescript
// 服务器：生成和验证 CSRF 令牌
import { randomBytes } from 'crypto';

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

// 中间件：在状态变更请求上验证
function csrfMiddleware(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    if (!timingSafeEqual(token, req.session.csrfToken)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }
  next();
}
```

对于使用基于令牌的认证（Bearer 令牌）的 API，CSRF 不是必需的，因为浏览器不会自动发送令牌。

## 内容安全策略

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

从严格开始，根据需要放宽。使用 `nonce` 而非 `unsafe-inline` 处理内联脚本。使用 `report-uri` 指令报告违规。先用 `Content-Security-Policy-Report-Only` 测试。

## 安全标头

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

在每个响应上设置这些。使用 `helmet`（Node.js）或等效中间件。

## 速率限制

```typescript
// 每用户、每端点的速率限制
const rateLimits = {
  'POST /auth/login':    { window: '15m', max: 5 },
  'POST /auth/register': { window: '1h',  max: 3 },
  'POST /api/*':         { window: '1m',  max: 60 },
  'GET /api/*':          { window: '1m',  max: 120 },
};
```

使用滑动窗口算法。将计数器存储在 Redis 中。返回 `429` 和 `Retry-After` 标头。对认证端点应用更严格的限制。

## JWT 最佳实践

- 访问令牌使用短过期时间（15 分钟）
- 刷新令牌（7-30 天）存储在 httpOnly cookie 中
- 微服务使用 RS256（非对称）签名，单体使用 HS256（对称）
- 永远不要在 JWT 负载中存储敏感数据（它是 base64 编码，而非加密）
- 在每个请求上验证 `iss`、`aud`、`exp` 和 `nbf` 声明
- 通过黑名单或短过期+轮换实现令牌撤销

```typescript
// 使用所有检查验证 JWT
const payload = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: 'auth.example.com',
  audience: 'api.example.com',
  clockTolerance: 30,
});
```

## 机密管理

- 永远不要将机密提交到版本控制（为 `.env` 使用 `.gitignore`）
- 使用环境变量存储运行时机密
- 在生产中使用机密管理器（AWS Secrets Manager、HashiCorp Vault、Doppler）
- 定期轮换机密（API 密钥最长 90 天）
- 每个环境使用不同的机密（dev/staging/prod）
- 在 CI 中扫描泄露的机密：`trufflehog`、`gitleaks`、`git-secrets`

```bash
# 检查 git 历史中的机密
gitleaks detect --source . --verbose

# 防止提交机密的预提交钩子
gitleaks protect --staged
```

## 依赖审计

```bash
# Node.js
npm audit --production
npx better-npm-audit audit --level=high

# Python
pip-audit
safety check

# Go
govulncheck ./...
```

在每个 PR 的 CI 中运行依赖审计。阻止存在严重/高危漏洞的合并。固定依赖版本。每周通过自动化 PR（Dependabot、Renovate）更新依赖。

## 部署前清单

1. 所有输入通过 schema 验证
2. SQL 查询参数化
3. 安全标头已配置
4. 通过 HSTS 强制 HTTPS
5. 机密已外部化，不在代码中
6. 依赖已审计，无严重漏洞
7. 所有公共端点启用速率限制
8. 认证令牌会过期和轮换
9. 错误消息不泄露内部细节
10. 日志记录捕获安全事件但不含敏感数据
