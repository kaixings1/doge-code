---
description: 为测试、原型和演示生成真实感合成数据集
argument-hint: "<describe the dataset you need — columns, size, characteristics>"
---

# /generate-data — 合成数据生成器

创建符合你规格的真实感合成数据集。

## 调用

```
/generate-data 带有季节性趋势的 1 万行电商交易数据
/generate-data 用于测试流失模型的 5000 条客户表记录
/generate-data 使用合成数据复制此上传文件的 schema
```

## 工作流

### 步骤 1：定义需求
- Schema（列、类型、约束）
- 大小（行数）
- 特殊特征（分布、相关性、异常、时间模式）
- 输出格式（CSV、JSON、SQL、Python 代码）

### 步骤 2：生成数据
应用 **generate-synthetic-data** 技能：
- 创建符合规格的真实数据
- 维护关系表的引用完整性
- 注入配置的缺失数据模式和异常值

### 步骤 3：验证与交付
- 验证汇总统计与规格匹配
- 预览示例行
- 以请求的格式含生成脚本交付

提供后续选项：
- "想要使用 /eda **探索此数据**吗？"
- "需要**调整分布或添加更多列**吗？"
- "需要我**生成带有外键关系的相关表**吗？"
