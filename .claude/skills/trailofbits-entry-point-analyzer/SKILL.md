---
name: 入口点分析器
description: 系统性识别智能合约代码库中改变状态的入口点，指导安全审计。
---

# 入口点分析器

A Claude skill for systematically identifying **state-changing** entry points in smart contract codebases to guide security audits.

## 目的

When auditing smart contracts, examining each file or function individually is inefficient. What auditors need is to start from **entry points**—the externally callable functions that represent the attack surface. This skill automates the identification and classification of state-changing entry points, excluding view/pure/read-only functions that cannot directly cause loss of funds or state corruption.

## Supported Languages

| Language | File Extensions | Framework Support |