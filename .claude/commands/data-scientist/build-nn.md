---
description: 设计到训练神经网络的完整流程
argument-hint: "<describe your problem and data>"
---

# /build-nn — Neural Network Builder

Design, build, and train a neural network for your task.

## Invocation

```
/build-nn Image classifier for 10 product categories with 5000 images
/build-nn Tabular neural network for fraud detection
/build-nn Sequence model for predicting next user action
```

## Workflow

Apply **neural-network-design** skill → **training-optimization** skill → evaluate.

Offer follow-up:
- "Want to **use a pretrained model** instead with /fine-tune?"
- "Should I **deploy** this model with /deploy?"
