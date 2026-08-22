---
description: 分析日志文件，识别错误和警告模式
---

## 上下文

- 日志文件路径：`$ARGUMENTS`（可选，默认 `./debug.txt`）

## 任务

分析日志文件并提供报告：

1. 读取指定的日志文件（每行一个 JSON 或纯文本）
2. 统计总日志条数
3. 按级别分类（error / warn / info / debug）
4. 提取错误类型统计（按错误消息前缀分组）
5. 列出最新的 5 个错误详情
6. 提供修复建议

输出格式：
```
📊 日志分析报告
================
文件: {filePath}
总计: {total} 条日志

按级别分布:
- 错误: {errorCount}
- 警告: {warnCount}
- 信息: {infoCount}
- 调试: {debugCount}

🔴 常见错误类型:
1. {errorType} - {count} 次
2. ...

📝 最新错误:
{latestErrors}

💡 修复建议:
- {suggestion}
```
