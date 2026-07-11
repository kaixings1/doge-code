---
name: 适用于通过 CLI 自动化 LinkedIn
description: "适用于通过 CLI 自动化 LinkedIn：获取个人资料、搜索人/公司、发送消息、管理连接、创建帖子和销售导航器。"
risk: safe
source: community
date_added: "2026-02-27"
---

## 何时使用
当您需要通过 CLI 自动化 LinkedIn 任务（如获取个人资料、管理连接或创建帖子）时使用此技能，特别是集成到自动化工作流中时。

# LinkedIn 技能

你可以使用 `linkedin` — 一个用于 LinkedIn 自动化的 CLI 工具。用于获取个人资料、搜索人员和公司、发送消息、管理连接、创建帖子、点赞、评论等。

每个命令向 Linked API 发送请求，该 API 运行真实的云浏览器在 LinkedIn 上执行操作。操作**不是即时的**—根据复杂程度，预计需要 30 秒到几分钟。

如果 `linkedin` 不可用，请安装：

```bash
npm install -g @linkedapi/linkedin-cli
```

## 认证

如果命令以退出码 2（认证错误）失败，请让用户设置他们的账户：

1. 前往 [app.linkedapi.io](https://app.linkedapi.io) 注册或登录
2. 连接他们的 LinkedIn 账户
3. 从仪表板复制 **Linked API 令牌** 和 **Identification 令牌**

一旦用户提供了令牌，运行：

```bash
linkedin 设置 --linked-api-令牌=令牌 --identification-令牌=令牌
```

### 何时使用
当你需要**从脚本或 AI 代理编排 LinkedIn 操作**而不是通过网页 UI 点击时使用此技能：

- 构建依赖 LinkedIn 数据和消息的拓展、研究或招聘工作流。
- 通过批量获取人脉和公司资料来丰富潜在客户或账户。
- 协调需要 JSON 输出和退出码的多步骤 Sales Navigator 或工作流。

使用自动化操作真实账户时，始终遵守 LinkedIn 的服务条款、当地法规和组织的合规政策。

## 全局标志

Always use `--json` and `-q` for machine-readable output:

```bash
linkedin <command> --json -q
```

| 标志                    | 描述                             |
