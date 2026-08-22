---
description: 检查代码覆盖率是否达到阈值要求
---

## 上下文

- 覆盖率文件：`coverage/coverage-final.json`
- 默认阈值：lines 80%, functions 80%, branches 75%, statements 80%

## 任务

1. 读取覆盖率 JSON 文件
2. 对比各项指标的阈值
3. 列出未达标文件
4. 提供覆盖率提升建议

输出格式：
```
📊 覆盖率检查报告
================
总体覆盖率:
- 行覆盖率: {linesPct}% (要求: {threshold}%) {'✓' if passed else '✗'}
- 函数覆盖率: {functionsPct}% (要求: {threshold}%) {'✓' if passed else '✗'}
- 分支覆盖率: {branchesPct}% (要求: {threshold}%) {'✓' if passed else '✗'}
- 语句覆盖率: {statementsPct}% (要求: {threshold}%) {'✓' if passed else '✗'}

{'✅ 所有指标达标' or '❌ 以下指标未达标:'}
{unpassedItems}

💡 提升建议:
- {suggestion}
```
