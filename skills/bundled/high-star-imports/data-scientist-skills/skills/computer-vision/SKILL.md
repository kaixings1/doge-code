---
name: computer-vision
description: "Build computer vision models: image classification, object detection, segmentation, data augmentation strategies, and evaluation. Covers CNN architectures, transfer learning from pretrained models, and handling small datasets. Use when working with image data."
---

# Computer Vision

## Purpose
Build and train computer vision models for image classification, detection, and segmentation.

## How It Works

### Task Selection

| Task | Architecture | Library |
|------|-------------|---------|
| Image classification | ResNet, EfficientNet, ViT | torchvision, timm |
| Object detection | YOLOv8, Faster R-CNN, DETR | ultralytics, detectron2 |
| Segmentation | U-Net, Mask R-CNN, SAM | segmentation_models |
| Similarity search | CLIP, embeddings | transformers |

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

## Usage Examples

```
"Build an image classifier for 10 product categories with only 500 images"
```

```
"Set up object detection for detecting defects in manufacturing images"
```

## Output Format

- **Architecture**: Model design with layer details
- **Training Code**: PyTorch / torchvision / ultralytics implementation
- **Augmentation Pipeline**: albumentations configuration
- **Evaluation**: Metrics and GradCAM visualizations
