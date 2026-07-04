---
name: security-and-hardening
description: 安全与加固 — 加固代码以抵御漏洞。在处理用户输入或敏感数据时使用。
---

# 安全与加固

## 概述

Web 应用的安全优先开发实践。将每个外部输入视为敌意，每个秘密视为神圣，每个授权检查视为强制。安全不是一个阶段——它是每行接触用户数据、认证或外部系统的代码的约束。

## 何时使用

- 构建任何接受用户输入的内容
- 实现身份认证或授权
- 存储或传输敏感数据
- 与外部 API 或服务集成
- 添加文件上传、webhook 或回调
- 处理支付或 PII 数据

## 流程：先做威胁模型

没有威胁模型就加安全控制，只是在猜。在加固之前，花五分钟像攻击者一样思考：

1. **绘制信任边界。** 不受信任的数据在哪里进入你的系统？HTTP 请求、表单字段、文件上传、webhook、第三方 API、消息队列和 **LLM 输出**。每个边界都是攻击面。
2. **命名资产。** 什么值得窃取或破坏？凭据、PII、支付数据、管理员操作、资金流动。
3. **在每个边界上运行 STRIDE** — 快速透镜，而非仪式：

| 威胁 | 问 | 典型缓解措施 |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 02 MINUTES 16 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE