# MCP 记忆集成

此集成将 MCP 记忆系统连接到 Agency 代理网络。

## 概述

MCP 记忆集成使代理能够通过 Model Context Protocol (MCP) 保留和回忆跨会话的信息。

## 安装

```bash
./scripts/install.sh --tool mcp-memory
```

## 配置

在项目根目录创建 `.mcp-memory.json` 配置文件。

## 使用方法

代理会自动存储和检索相关上下文。

## 重新生成

```bash
./scripts/convert.sh --tool mcp-memory
```
