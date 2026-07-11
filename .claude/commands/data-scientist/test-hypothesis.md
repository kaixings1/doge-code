---
description: 为你的数据选择并执行正确的统计检验
argument-hint: "<describe what you want to test>"
---

# /test-hypothesis — 假设检验

选择正确的统计检验并在假设检查下运行。

## 调用

```
/test-hypothesis 移动端和桌面端的转化率是否存在显著差异？
/test-hypothesis [上传文件] 比较 4 个客户分群的平均订单价值
/test-hypothesis 测试新功能是否提高了用户参与度
```

## 工作流

### 步骤 1：识别问题
解析研究问题——在比较什么、有多少组、数据类型是什么。

### 步骤 2：选择与检查
应用 **hypothesis-test** 技能——选择检验、检查假设、推荐替代方案。

### 步骤 3：运行与解释
执行检验、计算效应量、生成通俗语言解释。

提供后续选项：
- "想要使用 /calculate-sample **计算未来测试的样本量**吗？"
- "需要使用 /regress **进行更详细的回归**吗？"
- "想要**使用多重检验校正测试更多假设**吗？"
