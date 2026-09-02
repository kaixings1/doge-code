---
name: loop-swe-agent
description: "SWE-Agent 策略循环引擎 — 问题定位 + 修复 + 验证"
argument-hint: "<problem> [--instance-id ID] [--max-steps N]"
model: sonnet
color: orange
---

# Loop SWE-Agent — 问题定位与修复循环

> **Guard**: 如果 `$ARGUMENTS` 为空或仅包含选项而没有 `<problem>`，立即输出以下内容并停止：
> ```
> 用法: /loop-swe-agent <problem> [--instance-id ID] [--max-steps N]
>
> <problem> 是必填参数。示例:
>   /loop-swe-agent "FIX: 用户头像上传失败，返回 500 错误"
>   /loop-swe-agent "修复内存泄漏：长时间运行后浏览器标签页崩溃"
> ```
> 输出后立即停止，不要进入 Phase 1。

SWE-Agent 循环引擎模拟 SWE-Agent（Facebook 的软件工程代理）的问题解决模式。针对给定的软件问题，执行定位、修复、验证的闭环。

## Core Concept

```
Problem → Search → Localize → Patch → Verify → (loop if needed) → Submit
```

## Usage

`/loop-swe-agent <problem> [options]`

### Arguments

- `<problem>` — 要解决的问题描述（必填）
  - 示例: "FIX: 用户头像上传失败，返回 500 错误"
  - 示例: "修复内存泄漏：长时间运行后浏览器标签页崩溃"
  - 示例: "修复数据库连接池耗尽问题"

### Options

- `--instance-id ID` — 实例 ID（用于跟踪多个并行任务）
- `--max-steps N` — 最大执行步数（默认 25）
- `--search-depth N` — 代码搜索深度（默认 3）
- `--patch-only` — 只生成 patch，不应用

## Workflow

### Phase 1: Problem Understanding

深入理解问题：

```
1. 解析问题描述
2. 识别关键信息：
   - 错误消息/堆栈跟踪
   - 涉及的模块/组件
   - 重现步骤
3. 确定问题类型：
   - Bug 修复
   - 功能实现
   - 性能优化
   - 安全漏洞
```

### Phase 2: Code Search

定位相关代码：

```
1. 根据关键词搜索代码（Grep/Glob）
2. 读取相关文件和上下文
3. 识别可能的故障点
4. 构建代码路径图谱
```

搜索策略：
- 搜索错误消息关键词
- 搜索相关函数/类名
- 搜索配置文件
- 搜索测试文件（了解预期行为）

### Phase 3: Root Cause Analysis

分析根本原因：

```
1. 读取可疑代码
2. 理解代码逻辑
3. 识别 bug 来源：
   - 空指针/未定义引用
   - 类型错误
   - 竞态条件
   - 资源泄漏
   - 配置错误
4. 验证假设（添加调试日志或运行测试）
```

### Phase 4: Patch Generation

生成修复方案：

```
1. 设计修复方案
2. 生成 patch（diff 格式）
3. 应用 patch（Edit/Write）
4. 确保修改最小化
```

Patch 原则：
- 最小化修改（只改必要的行）
- 保持代码风格一致
- 不引入新功能，只修复问题
- 添加必要的注释

### Phase 5: Verification

验证修复：

```
1. 运行相关测试
2. 手动验证（如果可能）
3. 检查边缘情况
4. 如果验证失败：
   - 分析失败原因
   - 重新搜索代码
   - 生成新 patch（循环）
```

### Phase 6: Submit

提交修复：

```
1. git add 修改的文件
2. git commit（使用问题 ID 作为前缀）
3. git push
4. 如果需要，创建 PR
```

## Search Strategies

### 1. Error Message Search

```bash
# 搜索错误消息
Grep: "500 Internal Server Error"
Grep: "avatar upload failed"
Grep: "EADDRINUSE"
```

### 2. Function/Class Search

```bash
# 搜索相关函数
Grep: "function uploadAvatar"
Grep: "class AvatarUploader"
```

### 3. Configuration Search

```bash
# 搜索配置
Grep: "maxConnections"
Grep: "upload.*size"
```

### 4. Test Search

```bash
# 搜索测试（了解预期行为）
Grep: "avatar.*upload"
Glob: "**/*avatar*.test.ts"
```

## Iteration Logic

```
steps = 0
max_steps = 25
fixed = false

while (steps < max_steps && !fixed):
  1. Search for relevant code
  2. Analyze root cause
  3. Generate patch
  4. Apply patch
  5. Run tests
  6. If tests pass:
     - fixed = true
     - Submit solution
  7. Else:
     - Analyze failure
     - steps++
```

## Stop Conditions

- ✅ 问题修复并通过验证
- ✅ 达到 `--max-steps` 上限
- ✅ 无法定位根本原因
- ✅ 修复引入新的问题（3 次循环后）
- ✅ 用户中断

## Examples

```bash
# 基础用法：修复 bug
/loop-swe-agent "FIX: 用户头像上传失败，返回 500 错误"

# 指定实例 ID（并行任务）
/loop-swe-agent "修复内存泄漏" --instance-id leak-001
/loop-swe-agent "修复数据库连接池" --instance-id db-002

# 限制步数
/loop-swe-agent "修复复杂并发问题" --max-steps 10

# 只生成 patch 不应用
/loop-swe-agent "修复 XSS 漏洞" --patch-only
```

## Differences from /loop

| Feature | /loop | /loop-swe-agent |
|---------|-------|-----------------|
| Problem-driven | ❌ | ✅ 从具体问题开始 |
| Code search | ❌ | ✅ 自动搜索相关代码 |
| Root cause analysis | ❌ | ✅ 深入分析根本原因 |
| Patch generation | ❌ | ✅ 生成最小化修复 |
| Verification loop | ❌ | ✅ 测试驱动迭代 |
| Instance tracking | ❌ | ✅ 支持多实例并行 |

## Integration with Loop V2

SWE-Agent 循环会记录到 Loop V2 监控系统：
- 每次搜索作为 checkpoint
- Patch 内容记录在状态中
- 测试结果作为验证标记
- 失败案例进入死信队列

## Tools Used

- **Grep/Glob** — 代码搜索和定位
- **Read** — 读取代码和上下文
- **Edit/Write** — 应用 patch
- **Bash** — 运行测试和验证

## Best Practices

1. **理解先于修改**：确保理解问题再动手
2. **最小化 patch**：只改必要的行
3. **测试驱动**：先运行测试，再生成 patch
4. **验证假设**：通过调试确认根本原因
5. **保留上下文**：记录搜索过程，便于回溯
