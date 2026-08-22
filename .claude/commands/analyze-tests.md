---
description: 分析测试结果，识别失败模式和需要关注的测试
---

## 上下文

- 测试结果 JSON 文件：`coverage/test-results.json`

## 任务

分析测试结果并提供结构化报告：

1. 读取 `coverage/test-results.json`
2. 统计失败/通过/跳过的测试用例
3. 识别失败模式（相同错误类型分组）
4. 列出失败最多的前 10 个测试文件
5. 提供改进建议

输出格式：
```
📊 测试分析报告
================
总计: {total} 个测试
通过: {passed} ({passRate}%)
失败: {failed}
跳过: {skipped}

🔴 常见失败模式:
1. {errorPattern} - 出现 {count} 次
2. ...

📁 失败最多的文件:
1. {filePath} - {failCount} 个失败

💡 改进建议:
- {suggestion}
```
