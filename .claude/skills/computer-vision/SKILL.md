---
name: 计算机视觉
description: "构建计算机视觉模型：图像分类、目标检测、分割、姿态估计和人脸识别。涵盖 YOLO、ResNet、Vision Transformer 和 SAM。"
---

# 计算机视觉

## 目的
构建和训练用于图像分类、检测和分割的计算机视觉模型。

## 工作原理

### 任务选择

| 任务 | 架构 | 库 |
|------|-------------|---------|
| 图像分类 | ResNet、EfficientNet、ViT | torchvision、timm |
| 目标检测 | YOLOv8、Faster R-CNN、DETR | ultralytics、detectron2 |
| 分割 | U-Net、Mask R-CNN、SAM | segmentation_models |
| 相似度搜索 | CLIP、嵌入 | transformers |

### Data Augmentation
- **Geometric**: rotation, flip, crop, resize, affine
- **Color**: brightness, contrast, saturation, hue
- **Advanced**: MixUp, CutMix, CutOut, mosaic
- **Library**: albumentations (recommended), torchvision.transforms

### Training Strategy
- Transfer learning: freeze backbone, train head first, then fine-tune
- Learning rate: cosine annealing, warm-up, one-cycle
- Small dataset: heavy augmentation, pretrained backbone, progressive resizing

### Evaluation
- Accuracy, per-class accuracy, top-5 accuracy
- mAP (detection), IoU (segmentation)
- Confusion matrix, per-class precision/recall
- GradCAM for visual explanations

## 用法 Examples

```
"Build an image classifier for 10 product categories with only 500 images"
```

```
"Set up object detection for detecting defects in manufacturing images"
```

## 输出格式

- **架构**: Model design with layer details
- **Training Code**: PyTorch / torchvision / ultralytics implementation
- **Augmentation Pipeline**: albumentations 配置
- **Evaluation**: Metrics and GradCAM visualizations
