---
name: 训练优化
description: "优化深度学习训练：学习率调度（余弦、预热、one-cycle）、正则化（dropout、权重衰减、标签平滑）、早停、混合精度、梯度累积和分布式训练。适用于改进训练速度、稳定性或模型性能。"
---

# 训练优化

## 目的
Optimize neural network training for faster convergence, better generalization, and efficient resource usage.

## 工作原理

### Learning Rate Strategies
- **Warm-up**: Gradually increase LR from small value (prevents early divergence)
- **Cosine annealing**: Smooth decay following cosine curve
- **One-cycle**: Warm-up → peak → cosine decay (fastest convergence)
- **Reduce on plateau**: Drop LR when validation loss stalls
- **Learning rate finder**: Sweep to find optimal range

### Regularization
- **Dropout**: 0.1-0.5 between layers (higher for larger models)
- **Weight decay**: 0.01-0.1 (L2 regularization via optimizer)
- **Label smoothing**: 0.1 (prevents overconfident predictions)
- **Data augmentation**: Task-specific augmentations
- **Batch normalization**: Stabilizes training, mild regularization
- **Stochastic depth**: Randomly drop layers during training

### Efficiency
- **Mixed precision (fp16/bf16)**: 2x speed, half memory
- **Gradient accumulation**: Simulate larger batch sizes
- **Gradient checkpointing**: Trade compute for memory
- **Compiled models**: torch.compile() for speed
- **Distributed training**: DataParallel, DistributedDataParallel

### Monitoring
- Track train/val loss, learning rate, gradient norms
- Use W&B, TensorBoard, or MLflow
- Early stopping with patience (5-10 epochs typical)
- Watch for gradient explosion/vanishing

## 使用示例

```
"My model is overfitting after 10 epochs — what regularization should I add?"
```

```
"Optimize training speed — I'm training on a single GPU and it takes 8 hours"
```

## 输出格式

- **Optimization Plan**: Recommended changes with rationale
- **Training 配置**: Complete config (optimizer, scheduler, regularization)
- **PyTorch Code**: Training loop with all optimizations
- **Monitoring 设置**: W&B / TensorBoard 配置
