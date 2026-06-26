# Orchestrate 命令

用于处理复杂任务的顺序智能体（Agent）工作流（Workflow）。

## 用法

`/orchestrate [workflow-type] [task-description]`

## 工作流类型

### feature（功能开发）
完整的特性实现工作流：
```
planner -> tdd-guide -> code-reviewer -> security-reviewer
```

### bugfix（缺陷修复）
Bug 调查与修复工作流：
```
planner -> tdd-guide -> code-reviewer
```

### refactor（重构）
安全重构工作流：
```
architect -> code-reviewer -> tdd-guide
```

### security（安全）
以安全为中心的评审：
```
security-reviewer -> code-reviewer -> architect
```

## 执行模式

对于工作流中的每个智能体（Agent）：

1. **调用智能体**，并传入上一个智能体的上下文（Context）
2. **收集输出**，作为结构化的交接（Handoff）文档
3. **传递给链条中的下一个智能体**
4. **汇总结果**到最终报告中

## 交接（Handoff）文档格式

在智能体之间创建交接文档：

```markdown
## HANDOFF: [previous-agent] -> [next-agent]

### Context
[已完成工作的摘要]

### Findings
[关键发现或决策]

### Files Modified
[修改的文件列表]

### Open Questions
[留给下一个智能体的未解决问题]

### Recommendations
[建议的后续步骤]
```

## 示例：特性工作流

```
/orchestrate feature "Add user authentication"
```

执行过程：

1. **Planner 智能体**
   - 分析需求
   - 创建实现计划
   - 识别依赖项
   - 输出：`HANDOFF: planner -> tdd-guide`

2. **TDD Guide 智能体**
   - 读取 planner 的交接文档
   - 先编写测试
   - 实现代码以通过测试
   - 输出：`HANDOFF: tdd-guide -> code-reviewer`

3. **Code Reviewer 智能体**
   - 评审实现代码
   - 检查问题
   - 建议改进方案
   - 输出：`HANDOFF: code-reviewer -> security-reviewer`

4. **Security Reviewer 智能体**
   - 安全审计
   - 漏洞检查
   - 最终批准
   - 输出：最终报告（Final Report）

## 最终报告格式

```
编排报告
====================
工作流：feature
任务：Add user authentication
智能体：planner -> tdd-guide -> code-reviewer -> security-reviewer

摘要
-------
[一段话摘要]

智能体输出
-------------
Planner：[摘要]
TDD Guide：[摘要]
Code Reviewer：[摘要]
Security Reviewer：[摘要]

文件变更
-------------
[列出所有已修改的文件]

测试结果
------------
[测试通过/失败摘要]

安全状态
---------------
[安全发现]

建议
--------------
[发布 (SHIP) / 需继续完善 (NEEDS WORK) / 已阻塞 (BLOCKED)]
```

## 并行执行

对于相互独立的检查，可以并行运行智能体：

```markdown
### 并行阶段
同时运行：
- code-reviewer（质量）
- security-reviewer（安全）
- architect（设计）

### 合并结果
将输出合并为一份报告
```

## 参数

$ARGUMENTS:
- `feature <description>` - 完整的特性开发工作流
- `bugfix <description>` - Bug 修复工作流
- `refactor <description>` - 重构工作流
- `security <description>` - 安全评审工作流
- `custom <agents> <description>` - 自定义智能体序列

## 自定义工作流示例

```
/orchestrate custom "architect,tdd-guide,code-reviewer" "Redesign caching layer"
```

## 提示

1. **从 planner 开始** 处理复杂特性
2. 在合并前 **务必包含 code-reviewer**
3. 对于鉴权/支付/个人隐私信息（PII），**使用 security-reviewer**
4. **保持交接文档简洁** —— 专注于下一个智能体需要的内容
5. 如果需要，在智能体之间 **运行验证**
