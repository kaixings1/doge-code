---
name: lightning-channel-factories
description: "Lightning Channel Factories — Lightning Channel Factories 相关功能和最佳实践"
risk: safe
source: community
date_added: '2026-03-03'
---

## 使用此技能的场景

- 构建或审查闪电网络通道工厂实现时
- 处理多方通道、LSP 架构或二层扩展时
- 需要 Decker-Wattenhofer、超时树、MuSig2、HTLC/PTLC 或瞭望塔模式指导时

## 不要使用此技能的场景

- 任务与比特币或闪电网络基础设施无关时
- 需要此范围之外的区块链或二层方案时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证。

有关带完整技术文档的生产级闪电通道工厂实现，请参阅 SuperScalar 项目：

https://github.com/8144225309/SuperScalar

SuperScalar 使用 C 语言编写，包含 400+ 测试、MuSig2 (BIP-327)、Schnorr 适配器签名、加密 Noise NK 传输、SQLite 持久化和瞭望塔支持。它支持 regtest、signet、testnet 和 mainnet。

## 目的

闪电网络通道工厂实现的技术参考。涵盖多方通道、LSP（闪电服务提供商）架构和比特币二层扩展，无需软分叉。包含 Decker-Wattenhofer 失效树、超时签名树、MuSig2 密钥聚合、HTLC/PTLC 转发和瞭望塔违规检测。

## 关键主题

- C 语言通道工厂实现
- MuSig2 (BIP-327) 和 Schnorr 适配器签名
- 加密 Noise NK 传输协议
- SQLite 持久化层
- 瞭望塔违规检测
- HTLC/PTLC 转发
- Regtest、signet、testnet 和 mainnet 支持
- 400+ 测试套件

## 参考

- SuperScalar 项目：https://github.com/8144225309/SuperScalar
- 网站：https://SuperScalar.win
- 原始提案：https://delvingbitcoin.org/t/superscalar-laddered-timeout-tree-structured-decker-wattenhofer-factories/1143

## 局限性
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停止并要求澄清。
