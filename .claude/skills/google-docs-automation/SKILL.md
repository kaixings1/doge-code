---
name: google-docs-自动化
description: "轻量级 Google Docs 集成，使用独立 OAuth 认证。不需要 MCP 服务器。"
license: Apache-2.0
risk: critical
source: community
metadata:
  author: sanjay3290
  version: "1.0"
---

# Google Docs

轻量级 Google Docs 集成，使用独立 OAuth 认证。不需要 MCP 服务器。

> **⚠️ 需要 Google Workspace 账户。** 不支持个人 Gmail 账户。

## 使用场景
- 需要从本地自动化脚本创建、搜索、读取或编辑 Google Docs 文档
- 任务涉及文档文本提取、追加/插入操作或 Workspace 文档中的内容替换
- 希望直接进行 Docs 自动化，无需依赖 MCP 服务器

## 首次设置

使用 Google 进行认证（打开浏览器）：
```bash
python scripts/auth.py login
```

检查认证状态：
```bash
python scripts/auth.py status
```

需要时注销：
```bash
python scripts/auth.py logout
```

## 命令

所有操作通过 `scripts/docs.py` 进行。如果未登录，首次使用时自动认证。

```bash
# 创建新文档
python scripts/docs.py create "Meeting Notes"

# 创建带有初始内容的文档
python scripts/docs.py create "Project Plan" --content "# Overview\n\nThis is the project plan."

# 按标题查找文档
python scripts/docs.py find "meeting" --limit 10

# 获取文档的文本内容
python scripts/docs.py get-text 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms

# 使用完整 URL 获取文本
python scripts/docs.py get-text "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"

# 在文档末尾追加文本
python scripts/docs.py append-text 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms "New paragraph at the end."

# 在文档开头插入文本
python scripts/docs.py insert-text 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms "Text at the beginning.\n\n"

# 替换文档中的文本
python scripts/docs.py replace-text 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms "old text" "new text"
```

## Document ID Format

Google Docs uses document IDs like `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`. You can:
- Use the full URL (the ID will be extracted automatically)
- Use just the document ID
- Get document IDs from the `find` command results

## Token Management

Tokens stored securely using the system keyring:
- **macOS**: Keychain
- **Windows**: Windows Credential Locker
- **Linux**: Secret Service API (GNOME Keyring, KDE Wallet, etc.)

Service name: `google-docs-skill-oauth`

Access 令牌s are automatically refreshed when expired using Google's cloud function.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
