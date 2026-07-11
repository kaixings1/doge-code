---
name: DWARF 调试专家
description: 交互式分析 DWARF 调试文件，理解 DWARF 调试格式/标准，编写 DWARF 数据解析代码。
---

# DWARF Expert

Interact with and analyze DWARF debug files, understand the DWARF debug format/standard, and write code that parses DWARF data.

**Author:** Evan Hellman

## 使用场景

当您需要以下操作时使用此技能：
- 理解或解析编译二进制文件中的 DWARF 调试信息
- 回答关于 DWARF 标准（v3、v4、v5）的问题
- 编写或审查与 DWARF 数据交互的代码
- 使用 `dwarfdump` 或 `readelf` 提取调试信息
- Verify DWARF data integrity using `llvm-dwarfdump --verify`
- Work with DWARF parsing libraries (libdwarf, pyelftools, gimli, etc.)

## 功能说明

This skill provides expertise on:
- DWARF standards (v3-v5) via web search and authoritative source references
- Parsing DWARF files using `dwarfdump` and `readelf` commands
- Verification workflows using `llvm-dwarfdump --verify` and `--statistics`
- Library recommendations for DWARF parsing in C/C++, Python, Rust, Go, and .NET
- DIE (Debug Information Entry) analysis and searching
- Understanding DWARF sections, attributes, and forms

## Authoritative Sources

This skill uses the following authoritative sources for DWARF standard information:
- **dwarfstd.org**: Official DWARF specification (via web search)
- **LLVM source**: `llvm/lib/DebugInfo/DWARF/` for reference implementations
- **libdwarf source**: github.com/davea42/libdwarf-code for C implementations

## 安装

```
/plugin install trailofbits/skills/plugins/dwarf-expert
```
