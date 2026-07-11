---
description: 设计到训练神经网络的完整流程
argument-hint: "<describe your problem and data>"
---

# /build-nn — 神经网络构建器

为你的任务设计、构建和训练神经网络。

## 调用

```
/build-nn 10个产品类别5000张图片的图像分类器
/build-nn 欺诈检测的表格神经网络
/build-nn 预测下一个用户操作的序列模型
```

## 工作流

应用 **neural-network-design** 技能 → **training-optimization** 技能 → 评估。

提供后续选项：
- "想要使用 /fine-tune **使用预训练模型**吗？"
- "需要我使用 /deploy **部署**此模型吗？"
