---
name: sciomc
description: "Sciomc — 协调并行科学家代理进行全面研究工作流的相关功能和最佳实践"
参数-hint: <research goal>
level: 4
---

# 研究技能

协调并行科学家代理进行全面研究工作流，可选 AUTO 模式实现完全自主执行。

## 概述

研究是一个多阶段工作流，将复杂研究目标分解为并行调查：

1. **分解** - 将研究目标拆分为独立阶段/假设
2. **执行** - 在每个阶段运行并行科学家代理
3. **验证** - 交叉验证发现，检查一致性
4. **综合** - 汇总结果形成综合报告

## 使用示例

```
/oh-my-claudecode:sciomc <goal>                    # 标准研究，带有用户检查点
/oh-my-claudecode:sciomc AUTO: <goal>              # 完全自主直到完成
/oh-my-claudecode:sciomc status                    # 检查当前研究会话状态
/oh-my-claudecode:sciomc resume                    # 恢复中断的研究会话
/oh-my-claudecode:sciomc list                      # 列出所有研究会话
/oh-my-claudecode:sciomc report <会话-id>       # 为会话生成报告
```

### 快速示例

```
/oh-my-claudecode:sciomc 不同排序算法的性能特征有哪些？
/oh-my-claudecode:sciomc AUTO: 分析此代码库中的认证模式
/oh-my-claudecode:sciomc API 层的错误处理是如何工作的？
```

## 研究协议

### 阶段分解模式

给定研究目标时，分解为 3-7 个独立阶段：

```markdown
## 研究分解

**目标：** <原始研究目标>

### 阶段 1：<阶段名称>
- **焦点：** 此阶段调查的内容
- **假设：** 预期发现（如适用）
- **范围：** 要检查的文件/区域
- **层级：** LOW | MEDIUM | HIGH

### 阶段 2：<阶段名称>
...
```

### 并行科学家调用

通过 Task 工具并行触发独立阶段：

```
// 阶段 1 - 简单数据收集
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[RESEARCH_STAGE:1] 调查...")

// 阶段 2 - 标准分析
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[RESEARCH_STAGE:2] 分析...")

// 阶段 3 - 复杂推理
Task(subagent_type="oh-my-claudecode:scientist", model="opus", prompt="[RESEARCH_STAGE:3] 深入分析...")
```

### 智能模型路由

**关键：始终显式传递 `model` 参数！**

| 任务复杂度 | 代理 | 模型 | 用途 |
