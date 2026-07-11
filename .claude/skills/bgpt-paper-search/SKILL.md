---
name: BGPT 论文搜索
description: "BGPT 论文搜索 — BGPT 论文搜索相关功能和最佳实践"
license: MIT
compatibility: Requires the BGPT MCP server configured in the agent host (npx mcp-remote or npx bgpt-mcp), internet access to bgpt.pro, and an optional BGPT API key for paid usage.
metadata: {"version": "1.1", "skill-author": "BGPT", "website": "https://bgpt.pro/mcp", "github": "https://github.com/connerlambden/bgpt-mcp"}
---

# BGPT /u8bba/u6587/u641c/u7d22

## 概述

BGPT is a remote MCP server that searches a curated database of scientific papers built from raw experimental data extracted from full-text studies. Unlike traditional literature databases that return titles and abstracts, BGPT returns structured data from the actual paper content — methods, quantitative results, sample sizes, quality assessments, and 25+ metadata fields per paper.

## 何时使用此技能

在以下情况下使用此技能：
- 搜索具有特定实验细节的科学论文
- 进行系统性或范围性文献综述
- 跨研究寻找定量结果、样本量或效应量
- 比较不同研究中使用的方法论
- 查找具有质量评分或证据等级评定的论文
- 需要来自全文论文的结构化数据（不仅仅是摘要）
- 为荟萃分析或临床指南构建证据表

## 设置

BGPT is a remote MCP server — no local installation required. Configure it in your agent's MCP settings before use; this skill instructs the agent to call the `search_papers` MCP tool and does not enable MCP access by itself.

### Claude Desktop / Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "bgpt": {
      "command": "npx",
      "args": ["mcp-remote", "https://bgpt.pro/mcp/sse"]
    }
  }
}
```

### npm (alternative)

```bash
npx bgpt-mcp
```

## 用法

Once the BGPT MCP server is configured, call its `search_papers` tool via the agent's MCP interface (not via Bash):

```
Search for papers about: "CRISPR gene editing efficiency in human cells"
```

The server returns structured results including:
- **Title, authors, journal, year, DOI**
- **Methods**: Experimental techniques, models, protocols
- **Results**: Key findings with quantitative data
- **Sample sizes**: Number of subjects/samples
- **Quality scores**: Study quality assessments
- **Conclusions**: Author conclusions and implications

## Pricing

- **Free tier**: 50 searches per network, no API key required
- **Paid**: $0.01 per result with an API key from [bgpt.pro/mcp](https://bgpt.pro/mcp)

