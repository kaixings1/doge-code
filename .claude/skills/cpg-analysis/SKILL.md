---
name: CPG 分析
description: "用于代码属性图分析的技能。使用 joern 等工具进行数据流图、控制流图和 AST 分析以发现漏洞。"
version: 1.0.0
---

# CPG 分析

## 什么是代码属性图？

代码属性图（CPG）是一种统一的数据结构，结合了代码的三种表示形式：

1. **抽象语法树（AST）**— 结构表示
2. **控制流图（CFG）**— 执行路径
3. **程序依赖图（PDG）**— 数据和控制依赖

这种组合实现了模式匹配工具无法实现的强大语义查询。

## 何时使用 CPG 与模式匹配

| Approach | Use When | Example |
|----------|----------|---------|
| **Pattern Matching** (Semgrep) | Known vulnerability patterns, syntax-level issues | Finding dynamic code execution calls |
| **CPG Analysis** (Joern) | Data flow tracking, cross-function analysis | Proving request input reaches database query through 5 functions |

**Rule of thumb**: Use CPG when you need to prove data flows between points, especially across function boundaries.

## Joern 概述

Joern is the primary tool for CPG analysis. It:
- Parses source code into CPG representation
- Provides CPGQL (Scala-based) query language
- Supports JavaScript, TypeScript, Python, Java, C/C++, Go, PHP

### Basic Joern Workflow

```bash
# 1. Parse codebase into CPG
joern-parse /path/to/code --output cpg.bin

# 2. Start Joern REPL or run scripts
joern --script analysis.sc --params cpgFile=cpg.bin

# 3. Or use Joern REPL interactively
joern
> importCpg("cpg.bin")
> cpg.method.name(".*login.*").l
```

## CPGQL Query Language

CPGQL uses Scala syntax with CPG-specific operations.

### 核心概念

**Nodes**: Represent code elements
- `cpg.method` - All methods/functions
- `cpg.call` - All function calls
- `cpg.parameter` - Function parameters
- `cpg.literal` - Literal values
- `cpg.identifier` - Variable references

**Traversals**: Navigate the graph
- `.name("pattern")` - Filter by name (regex)
- `.code("pattern")` - Filter by code content
- `.argument` - Get call arguments
- `.caller` - Get calling methods
- `.callee` - Get called methods

**Data Flow**: Track how data moves
- `.reachableBy(source)` - Find if source reaches this point
- `.reachableByFlows(source)` - Get full paths

### Common Query Patterns

**Find all calls to a function:**
```scala
cpg.call.name("query").l
```

**Find parameters that reach dangerous sinks:**
```scala
val sources = cpg.parameter.name("req.*|request.*")
val sinks = cpg.call.name("query|execute|run")
sinks.argument.reachableBy(sources).l
```

**Get full data flow paths:**
```scala
val sources = cpg.parameter.name("userInput")
val sinks = cpg.call.name("executeQuery")
sinks.argument.reachableByFlows(sources).p
```

## Confidence Scoring

After CPG verification:

| Verification Result | Confidence | Meaning |
|---------------------|------------|---------|
| Data flow confirmed | HIGH (0.9+) | CPG proves exploitability |
| Partial flow found | MEDIUM (0.6-0.9) | Some path exists, manual review needed |
| No flow found | LOW (0.3-0.6) | May be false positive or complex flow |
| Verification failed | UNKNOWN | Query error, manual analysis required |

## Skill 参考资料

- `references/cpgql-patterns.md` - Common vulnerability query patterns
- `references/joern-cheatsheet.md` - Quick Joern/CPGQL reference

## 相关 Skills

- **data-flow-tracing** - Manual source-to-sink analysis
- **dangerous-functions** - Sink identification by language
- **vuln-patterns** - Pattern-based vulnerability knowledge
