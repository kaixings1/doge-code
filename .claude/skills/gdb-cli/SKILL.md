---
name: 面向 AI 代理的 GDB 调试助手
description: "面向 AI 代理的 GDB 调试助手——分析核心转储、调试实时进程、结合源代码调查崩溃和死锁"
category: development
risk: critical
source: community
date_added: "2026-03-22"
author: Cerdore
tags:
- debugging
- gdb
- core-dump
- crash-analysis
- c++
- c
tools:
- claude-code
- 游标
- gemini-cli
- codex-cli
- antigravity
---

# GDB 调试助手

## 概述

A GDB debugging skill designed for AI agents. Combines **source code analysis** with **runtime state inspection** using gdb-cli to provide intelligent debugging assistance for C/C++ programs.

## 使用场景 This Skill

- Analyze core dumps or crash dumps
- Debug running processes with GDB attach
- Investigate crashes, deadlocks, or memory issues
- Get intelligent debugging assistance with source code context
- Debug multi-threaded applications

## 不适用场景

- The task is unrelated to C/C++ debugging
- The user needs general-目的 assistance without debugging
- No GDB is available (GDB 9.0+ with Python support required)

## 前提条件

```bash
# Install gdb-cli
pip install gdb-cli

# Or from GitHub
pip install git+https://github.com/Cerdore/gdb-cli.git

# Verify GDB has Python support
gdb -nx -q -batch -ex "python print('OK')"
```

**Requirements:**
- Python 3.6.8+
- GDB 9.0+ with Python support enabled
- Linux OS

## 工作原理

### 步骤 1: Initialize Debug 会话

**For core dump analysis:**
```bash
gdb-cli load --binary <binary_path> --core <core_path> [--gdb-path <gdb_path>]
```

**For live process debugging:**
```bash
gdb-cli attach --pid <pid> [--binary <binary_path>]
```

**Output:** A session_id like `"session_id": "a1b2c3"`. Store this for subsequent commands.

### 步骤 2: Gather Initial Information

```bash
会话="<session_id>"

# List all threads
gdb-cli threads -s $会话

# Get backtrace (with local variables)
gdb-cli bt -s $会话 --full

# Get registers
gdb-cli registers -s $会话
```

### 步骤 3: Correlate Source Code (CRITICAL)

For each frame in the backtrace:
1. **Extract frame info**: `{file}:{line} in {function}`
2. **Read source context**: Get ±20 lines around the crash point
3. **Get local variables**: `gdb-cli locals-cmd -s $会话 --frame <N>`
4. **Analyze**: Correlate code logic with variable values

**Example correlation:**
```
Frame #0: process_data() at src/worker.c:87
Source code shows:
  85: Node* node = get_node(id);
  86: if (node == NULL) return;
  87: node->data = value;  <- Crash here

Variables show:
  node = 0x0 (NULL)

Analysis: The NULL check on line 86 didn't catch the issue.
```

### 步骤 4: Deep Investigation

```bash
# Examine variables
gdb-cli eval-cmd -s $会话 "variable_name"
gdb-cli eval-cmd -s $会话 "ptr->field"
gdb-cli ptype -s $会话 "struct_name"

# Memory inspection
gdb-cli memory -s $会话 "0x7fffffffe000" --size 64

# Disassembly
gdb-cli disasm -s $会话 --count 20

# Check all threads (for deadlock analysis)
gdb-cli thread-apply -s $会话 bt --all

# View shared libraries
gdb-cli sharedlibs -s $会话
```

### 步骤 5: 会话 Management

```bash
# List active sessions
gdb-cli sessions

# Check 会话 status
gdb-cli status -s $会话

# Stop 会话 (cleanup)
gdb-cli stop -s $会话
```

## Common Debugging Patterns

### Pattern: Null Pointer Dereference

**Indicators:**
- Crash on memory access instruction
- Pointer variable is 0x0

**Investigation:**
```bash
gdb-cli registers -s $会话  # Check RIP
gdb-cli eval-cmd -s $会话 "ptr"  # Check pointer value
```

### Pattern: Deadlock

**Indicators:**
- Multiple threads stuck in lock functions
- `pthread_mutex_lock` in backtrace

**Investigation:**
```bash
gdb-cli thread-apply -s $会话 bt --all
# Look for circular wait patterns
```

### Pattern: Memory Corruption

**Indicators:**
- Crash in malloc/free
- Garbage values in variables

**Investigation:**
```bash
gdb-cli memory -s $会话 "&variable" --size 128
gdb-cli registers -s $会话
```

## 示例

### Example 1: Core Dump Analysis

```bash
# Load core dump
gdb-cli load --binary ./myapp --core /tmp/core.1234

# Get crash location
gdb-cli bt -s a1b2c3 --full

# Examine crash frame
gdb-cli locals-cmd -s a1b2c3 --frame 0
```

### Example 2: Live Process Debugging

```bash
# Attach to stuck server
gdb-cli attach --pid 12345

# Check all threads
gdb-cli threads -s b2c3d4

# Get all backtraces
gdb-cli thread-apply -s b2c3d4 bt --all
```

## 最佳实践

- Always read source code before drawing conclusions from variable values
- Use `--range` for pagination on large thread counts or deep backtraces
- Use `ptype` to understand complex data structures before examining values
- Check all threads for multi-threaded issues
- Cross-reference types with source code definitions

## Security & Safety Notes

- This skill requires GDB access to processes and core dumps
- Attaching to processes may require appropriate permissions (sudo, ptrace_scope)
- Core dumps may contain sensitive data - handle with care
- Only debug processes you have 授权 to analyze

## 相关技能

- `@systematic-debugging` - General debugging methodology
- `@test-driven-development` - Write tests before implementation

## Links

- **Repository**: https://github.com/Cerdore/gdb-cli
- **PyPI**: https://pypi.org/project/gdb-cli/
- **Documentation**: https://github.com/Cerdore/gdb-cli#readme

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
