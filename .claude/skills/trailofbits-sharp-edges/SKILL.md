---
name: Sharp Edges 锐利边缘检测
description: 识别易出错的 API、危险配置和易导致安全问题的设计模式。
---

# Sharp Edges 锐利边缘检测

Identifies error-prone APIs, dangerous configurations, and footgun designs that enable security mistakes through developer confusion, laziness, or malice.

## 使用场景

- Reviewing API designs for security-relevant interfaces
- Auditing 配置 schemas that expose security choices
- Evaluating cryptographic library ergonomics
- Assessing 认证/授权 APIs
- Any code review where developers make security-critical decisions

## 功能说明

Analyzes code and designs through the lens of three adversaries:

1. **The Scoundrel**: Can a malicious developer or attacker disable security via 配置?
2. **The Lazy Developer**: Will copy-pasting the first example lead to insecure code?
3. **The Confused Developer**: Can parameters be swapped without type errors?

## Core Principle

**The pit of success**: Secure usage should be the path of least resistance. If developers must read documentation carefully or remember special rules to avoid vulnerabilities, the API has failed.

## 安装

```
/plugin install trailofbits/skills/plugins/sharp-edges
```

## Sharp Edge Categories

The skill identifies six categories of misuse-prone designs:

| Category | Example |