---
name: Next.js/React 安全
description: "用于审计 Next.js/React 应用安全的技能。涵盖 SSR 漏洞、CSRF、XSS、服务端组件和路由处理器安全。"
---

# Next.js/React 安全分析
涵盖 Next.js 和 React 应用的全面安全模式，覆盖客户端和服务端攻击面。

## 攻击面分类
- 服务器操作：SSRF、直接对象引用、缺少认证
- 路由处理器：未认证端点、CORS配置错误
- 服务器组件：数据泄露、服务端XSS
- 中间件：路径绕过、头部注入
- 客户端组件：XSS、原型污染

## 检测命令
```bash
grep -rn '"use server"' --include=*.ts --include=*.tsx
find . -path */app/api/* -name route.ts -o -name route.js
find . -name middleware.ts
```

## 常见漏洞模式
- 服务器操作 SSRF
- 未保护的路由处理器
- 服务器组件数据泄露
- 中间件绕过