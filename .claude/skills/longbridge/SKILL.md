---
name: Longbridge 证券交易相关功能和最佳实践
description: "Longbridge — Longbridge 证券交易相关功能和最佳实践"
category: finance
risk: critical
source: official
source_repo: longbridge/skills
source_type: official
date_added: "2026-05-29"
author: longbridge
tags: [finance, stocks, trading, portfolio, market-data]
tools: [claude, 游标, gemini, codex]
license: "MIT"
license_source: "https://github.com/longbridge/skills/blob/main/LICENSE"
plugin:
  targets:
    codex: blocked
    claude: blocked
---

# Longbridge

## 概述

Longbridge 是 Longbridge Securities 的官方技能集合，涵盖 125+ 代理技能，涵盖实时市场数据、图表分析、公司基本面、投资组合管理、期权、行业筛选等。支持港股、美股、A 股（沪/深）和新加坡市场。所有技能均为三语（简体中文/繁体中文/英文）。

来源仓库：[github.com/longbridge/skills](https://github.com/longbridge/skills)（约 840 星，MIT）

## 何时使用此技能

- 当用户询问港股/美股/A 股/新加坡市场的股票价格、图表或市场数据时使用
- 当用户想要公司基本面、财报或分析师评级时使用
- 当用户通过 Longbridge 询问其投资组合、持仓或账户盈亏时使用
- 当用户想要期权分析、行业排名、资金流向或新闻时使用
- 当用户用中文（简体或繁体）或英文询问任何证券话题时使用

## 工作原理

### 步骤 1：发现正确的子命令

```bash
longbridge --help
```

列出所有可用的子命令。切勿硬编码子命令名称——CLI 会不断演进。

### 步骤 2：检查子命令选项

```bash
longbridge <subcommand> --help
```

在调用前确认标志和输出格式。

### 步骤 3：以 JSON 输出调用

```bash
longbridge <subcommand> --format json
```

解析结构化输出并以用户的语言（从输入检测）呈现。

## 认证

```bash
longbridge auth login          # 基本市场数据（只读）
longbridge auth login --trade  # 投资组合和账户功能
```

## 安装

```bash
# Claude Code 插件市场
/plugin marketplace add longbridge/skills

# 或通过 npx
npx skills add https://github.com/longbridge/skills
```

## MCP 回退

如果未安装 `longbridge` CLI 二进制文件，回退到 MCP 工具。在运行时检查可用的 MCP 工具——切勿硬编码 MCP 工具名称，因为它们会随服务器版本而变化。

## 局限性

- 投资组合和账户功能需要使用 Trade 范围登录。
- 实时数据受 Longbridge 数据订阅限制（未订阅也可获取延迟数据）。
- 加密货币符号在 Longbridge 平台上使用 `.HAS` 后缀。
- 此技能不进行下单——默认只读，除非使用账户写入范围。

## 安全与注意事项

- 所有市场数据查询均为只读（无副作用）。
- 自选列表变更和订单相关功能遵循预览 + 确认的两步协议。
- 凭证由 Longbridge 认证系统处理；此技能不存储或传输令牌。
