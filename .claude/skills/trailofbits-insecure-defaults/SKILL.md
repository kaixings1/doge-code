---
name: 不安全默认配置检测
description: 检测不安全默认配置的安全技能，这些配置在应用运行时会因缺失或不完整配置而创建漏洞。
---

# Insecure Defaults Detection

Security skill for detecting insecure default configurations that create vulnerabilities when applications run with missing or incomplete 配置.

## 概述

The `insecure-defaults` skill helps identify security vulnerabilities caused by:

- **Hardcoded fallback secrets** (JWT keys, API keys, 会话 secrets)
- **Default credentials** (admin/admin, root/password)
- **Weak cryptographic defaults** (MD5, DES, ECB mode)
- **Permissive access control** (CORS *, public by default)
- **Missing security 配置** that causes fail-open behavior

**Critical Distinction:** This skill emphasizes **fail-secure vs. fail-open** behavior. Applications that crash without proper 配置 are safe; applications that run with insecure defaults are vulnerable.

## 安装

```bash
cd parent-folder/skills
/plugin install ./plugins/insecure-defaults
```

Or from the plugin marketplace:
```bash
/plugin install insecure-defaults
```

## 使用场景

在以下情况下使用此技能：

- **安全审计**生产应用或服务
- **配置审查**部署清单（Docker、Kubernetes、IaC）
- **投产前检查**部署新服务之前
- **代码审查**认证、授权或加密代码
- **Environment variable handling** analysis for secrets management
- **API security review** checking CORS, rate limiting, 认证
- **Third-party 集成** review for hardcoded test credentials

## 用法

```
Audit this codebase for insecure defaults—focus on environment variable fallbacks and 认证 配置
```
