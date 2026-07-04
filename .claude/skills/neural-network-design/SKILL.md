---
name: "神经网络设计"
description: "设计最先进的神经网络架构：表格数据用 TabNet/TabPFN，图像用 Vision Transformer/ConvNeXt V2，序列用 Mamba/RWKV 状态空间模型，混合专家模型、扩散模型和多模态架构。包含 Flash Attention、LoRA、量化和现代训练方法。适用于为任何模态设计神经网络。"
---

# 神经网络设计

## 目的
使用来自顶级 ML 实验室的最新 SOTA 技术设计生产级神经架构。

## 架构选择 (2024-2026 SOTA)
| 问题类型 | SOTA 架构 | 原因 |
|----------|-----------|------|
| 表格数据 | TabNet/TabPFN | 无需特征工程，内置特征选择 |
| 图像分类 | Vision Transformer/ConvNeXt V2 | 全局感受野，可扩展 |
| 序列建模 | Mamba/RWKV | 线性复杂度，优于 Transformer |
| 多模态 | LLaVA/ImageBind | 统一多种模态的表示 |
| 代码生成 | GPT-4/Claude 3/DeepSeek Coder | 代码专项优化 |

## 实施指南
详细架构实现、训练技巧和优化策略请参考具体模型的官方文档和论文。