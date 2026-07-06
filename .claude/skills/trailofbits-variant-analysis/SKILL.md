# Variant Analysis

Find similar vulnerabilities and bugs across codebases using pattern-based analysis.

**Author:** Axel Mierczuk

## 使用场景

当您需要以下操作时使用此技能：
- 在发现初始漏洞后寻找漏洞变体
- 从已知漏洞模式构建 CodeQL 或 Semgrep 查询
- 跨大型代码库执行系统化代码审计
- 分析安全漏洞并查找类似实例
- 为重复出现的漏洞类别创建可复用模式

## What It Does

This skill provides a systematic five-step process for variant analysis:
1. **Understand the original issue** - Identify root cause, conditions, and exploitability
2. **Create an exact match** - Start with a pattern matching only the known bug
3. **Identify abstraction points** - Determine what can be generalized
4. **Iteratively generalize** - Expand patterns one element at a time
5. **Analyze and triage** - Document and prioritize findings

Includes:
- Tool selection guidance (ripgrep, Semgrep, CodeQL)
- Critical pitfalls to avoid (narrow scope, over-specific patterns)
- Ready-to-use templates for CodeQL and Semgrep in Python, JavaScript, Java, Go, and C++
- Detailed methodology documentation

## 安装

```
/plugin install trailofbits/skills/plugins/variant-analysis
```

## 相关技能

- `codeql` - Primary tool for deep interprocedural variant analysis
- `semgrep` - Fast pattern matching for simpler variants
- `sarif-parsing` - Process variant analysis results
