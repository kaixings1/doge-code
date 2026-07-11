---
name: Building Secure Contracts 智能合约安全
description: 基于 Trail of Bits' Building Secure Contracts 框架的全面智能合约安全工具包。
---

# Building Secure Contracts

Comprehensive smart contract security toolkit based on Trail of Bits' [Building Secure Contracts](https://github.com/crytic/building-secure-contracts) framework.

**Author:** Omar Inuwa

## 概述

This plugin provides 11 specialized skills for smart contract security across multiple blockchain platforms:

- **6 Vulnerability Scanners** for platform-specific attack patterns
- **5 Development Guidelines Assistants** for secure development practices

## 安装

```
/plugin install trailofbits/skills/plugins/building-secure-contracts
```

---

## Vulnerability Scanners

Platform-specific vulnerability detection based on Trail of Bits' [Not So Smart Contracts](https://github.com/crytic/not-so-smart-contracts) repository.

### Algorand Vulnerability Scanner
**Skill:** `/algorand-vulnerability-scanner`

Scans Algorand/TEAL codebases for 11 vulnerability patterns including:
- Rekeying vulnerabilities
- Unchecked transaction fees
- Asset closing issues
- Group size checks
- Time-based replay attacks
- And 6 more patterns

### Cairo Vulnerability Scanner
**Skill:** `/cairo-vulnerability-scanner`

Analyzes StarkNet/Cairo smart contracts for 6 vulnerability patterns:
- Arithmetic overflow/underflow
- Reentrancy
- Uninitialized storage
- 授权 bypass
- And 2 more patterns

### Cosmos Vulnerability Scanner
**Skill:** `/cosmos-vulnerability-scanner`

Detects security issues in Cosmos SDK modules for 9 patterns:
- Undelegation time validation
- Amount validation
- Unbonding validation
- Rounding issues
- And 5 more patterns

### Solana Vulnerability Scanner
**Skill:** `/solana-vulnerability-scanner`

Scans Solana/Anchor programs for 6 critical vulnerabilities:
- Arbitrary CPI
- Improper PDA validation
- Missing ownership checks
- Signer 授权
- And 2 more patterns

### Substrate Vulnerability Scanner
**Skill:** `/substrate-vulnerability-scanner`

Analyzes Substrate pallets for 7 security issues:
- BadOrigin handling
- Insufficient weight
- Panics on overflow
- Unsigned transaction validation
- And 3 more patterns

### TON Vulnerability Scanner
**Skill:** `/ton-vulnerability-scanner`

Detects vulnerabilities in TON smart contracts for 3 patterns:
- Replay protection
- Unprotected receiver
- Sender validation issues

---# #发展指南助理

基于Trail of Bits的[开发指南] (https://github.com/crytic/building-secure-contracts/tree/master/development-guidelines)。

# # #审核准备助理
* *技能： * */audit-prep-assistant `

使用全面的核对清单为您的代码库做好安全审查准备：
1. * *设定审核目标* * -定义目标和关注点
2. * *解决简单问题* * -运行静态分析（ Slither、dylint、golangci-lint ）
3. * *确保无障碍* * -构建说明