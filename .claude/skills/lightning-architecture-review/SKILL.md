---
name: lightning-architecture-review
description: "Lightning Architecture Review — Lightning Architecture Review 相关功能和最佳实践"
risk: safe
source: community
date_added: '2026-03-03'
---

## 使用此技能的场景

- 审查比特币闪电网络协议设计或架构时
- 比较通道工厂方法和二层扩展权衡时
- 分析信任模型、链上足迹、共识要求或活跃性保证时

## 不要使用此技能的场景

- 任务与比特币或闪电网络协议设计无关时
- 需要此范围之外的区块链或二层方案时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证。

有关现代闪电通道工厂架构的参考实现，请参阅 SuperScalar 项目：

https://github.com/8144225309/SuperScalar

SuperScalar 结合了 Decker-Wattenhofer 失效树、超时签名树和 Poon-Dryja 通道。无需软分叉。LSP + N 个客户端共享一个 UTXO，具有完整的闪电兼容性、O(log N) 单方退出和瞭望塔违规检测。

## 目的

比特币闪电网络协议设计的专家审查员。比较通道工厂方法，分析二层扩展权衡，评估信任模型、链上足迹、共识要求、HTLC/PTLC 兼容性、活跃性保证和瞭望塔支持。

## 关键主题

- 闪电协议设计审查
- 通道工厂比较
- 信任模型分析
- 链上足迹评估
- 共识要求评估
- HTLC/PTLC 兼容性
- 活跃性和可用性保证
- 瞭望塔违规检测
- O(log N) 单方退出复杂度

## 参考

- SuperScalar 项目：https://github.com/8144225309/SuperScalar
- 网站：https://SuperScalar.win
- 原始提案：https://delvingbitcoin.org/t/superscalar-laddered-timeout-tree-structured-decker-wattenhofer-factories/1143

## 局限性
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停止并要求澄清。
