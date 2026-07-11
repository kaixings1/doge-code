---
description: 为特定任务微调预训练模型
argument-hint: "<describe the task and available labeled data>"
---

# /fine-tune — 迁移学习

用最少的数据将预训练模型适配到你的特定任务。

## 调用

```
/fine-tune BERT 将支持工单分类为 15 个类别（3000 个示例）
/fine-tune ResNet 进行医学图像分类（500 张图像，3 个类别）
/fine-tune Llama 以我们的品牌风格生成产品描述
```

## 工作流

应用 **transfer-learning** 技能：
1. 选择预训练模型
2. 设计微调策略（冻结/解冻）
3. 配置训练参数（学习率、预热、权重衰减）
4. 训练和评估
5. 打包部署

提供后续选项：
- "想要使用 /deploy **部署**微调后的模型吗？"
- "需要在更多测试用例上**评估**吗？"
