---
name: test-analyzer
description: |
  分析测试结果和代码覆盖率，识别失败模式和未达标项。
  使用场景：运行测试后分析结果、检查覆盖率是否达标、排查失败的测试用例。
  触发词：测试分析、覆盖率检查、analyze-tests、check-coverage、分析日志、analyze-logs。
Keywords: test, coverage, analyze, logs, failure, 测试, 覆盖率, 日志分析
---

# Test Analyzer

测试结果和覆盖率分析工具集，基于项目已有的 scripts/ 脚本。

## 可用脚本

| 脚本 | 功能 |
|------|------|
| `scripts/analyze-logs.ts` | 分析日志文件，按级别分类，提取错误类型统计 |
| `scripts/check-coverage.ts` | 检查代码覆盖率是否达到阈值要求 |
| `scripts/analyze-tests.ts` | 分析测试结果 JSON，识别失败模式 |

## 分析日志

```bash
bun run scripts/analyze-logs.ts [logFile]
```

- 默认读取 `./debug.txt`
- 支持 JSON 行日志和纯文本
- 输出：总条数、按级别分布、常见错误类型、最新 5 个错误详情

## 检查覆盖率

```bash
bun run scripts/check-coverage.ts [coverageFile]
```

- 默认读取 `coverage/coverage-final.json`
- 默认阈值：lines 80%, functions 80%, branches 75%, statements 80%
- 通过率检查，输出未达标文件列表

## 分析测试结果

```bash
bun run scripts/analyze-tests.ts
```

- 读取 `coverage/test-results.json`
- 统计：通过/失败/跳过数量
- 识别失败最多的前 10 个测试文件
- 输出失败模式分组

## 自定义阈值

修改 `check-coverage.ts` 中的 `CoverageThresholds` 接口来调整阈值：

```typescript
const thresholds: CoverageThresholds = {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
};
```

## 日志分析输出示例

```
📊 日志分析报告
================
文件: ./debug.txt
总计: 150 条日志

按级别分布:
- 错误: 12
- 警告: 23
- 信息: 98
- 调试: 17

🔴 常见错误类型:
1. ECONNREFUSED - 5 次
2. TIMEOUT - 3 次

📝 最新错误:
[最近 5 条错误详情]

💡 修复建议:
- ECONNREFUSED: 检查服务是否启动
```

## 覆盖率报告输出示例

```
📊 覆盖率检查报告
================
总体覆盖率:
- 行覆盖率: 85% (要求: 80%) ✓
- 函数覆盖率: 78% (要求: 80%) ✗
- 分支覆盖率: 72% (要求: 75%) ✗
- 语句覆盖率: 83% (要求: 80%) ✓

❌ 以下指标未达标:
- 函数覆盖率: 78% < 80%
- 分支覆盖率: 72% < 75%

💡 提升建议:
- 为未覆盖的函数添加测试用例
- 补充分支条件的边界测试
```

## 项目测试配置

- 测试框架：Vitest
- 配置文件：`vitest.config.ts`
- 测试目录：`src/__tests__/`
- 覆盖率目录：`coverage/`
