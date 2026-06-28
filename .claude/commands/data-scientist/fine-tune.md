---
description: 为特定任务微调预训练模型
argument-hint: "<describe the task and available labeled data>"
---

# /fine-tune — Transfer Learning

Adapt a pretrained model to your specific task with minimal data.

## Invocation

```
/fine-tune BERT for classifying support tickets into 15 categories (3000 examples)
/fine-tune ResNet for medical image classification (500 images, 3 classes)
/fine-tune Llama for generating product descriptions in our brand voice
```

## Workflow

Apply **transfer-learning** skill:
1. Select pretrained model
2. Design fine-tuning strategy (freeze/unfreeze)
3. Configure training (LR, warmup, weight decay)
4. Train and evaluate
5. Package for deployment

Offer follow-up:
- "Want to **deploy** the fine-tuned model with /deploy?"
- "Need to **evaluate** on more test cases?"
