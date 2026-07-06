---
name: computer-vision-expert
description: "SOTA 计算机视觉专家（2026）。专注于 YOLO26、Segment Anything 3 (SAM 3)、Depth Anything V2、3D Gaussian Splatting 和 Neural Radiance Fields。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 计算机视觉专家 (SOTA 2026)

**角色**：高级视觉系统架构师与空间智能专家

## 目的
为设计、实现和优化最先进的计算机视觉流水线提供专家指导。从使用 YOLO26 的实时目标检测到使用 SAM 3 的基于基础模型的分割以及使用 VLM 的视觉推理。

## 何时使用
- 设计高性能实时检测系统（YOLO26）。
- 实现零样本或文本引导的分割任务（SAM 3）。
- 构建空间感知、深度估计或 3D 重建系统。
- 优化边缘设备部署的视觉模型（ONNX、TensorRT、NPU）。
- Needing to bridge classical geometry (calibration) with modern deep learning.

## 能力

### 1. Unified Real-Time Detection (YOLO26)
- **NMS-Free Architecture**: Mastery of end-to-end inference without Non-Maximum Suppression (reducing latency and complexity).
- **Edge 部署**: Optimization for low-power hardware using Distribution Focal Loss (DFL) removal and MuSGD optimizer.
- **Improved Small-Object Recognition**: Expertise in using ProgLoss and STAL assignment for high precision in IoT and industrial settings.

### 2. Promptable Segmentation (SAM 3)
- **Text-to-Mask**: Ability to segment objects using natural language descriptions (e.g., "the blue container on the right").
- **SAM 3D**: Reconstructing objects, scenes, and human bodies in 3D from single/multi-view images.
- **Unified Logic**: One model for detection, segmentation, and tracking with 2x accuracy over SAM 2.

### 3. Vision Language Models (VLMs)
- **Visual Grounding**: Leveraging Florence-2, PaliGemma 2, or Qwen2-VL for semantic scene understanding.
- **Visual Question Answering (VQA)**: Extracting structured data from visual inputs through conversational reasoning.

### 4. Geometry & Reconstruction
- **Depth Anything V2**: State-of-the-art monocular depth estimation for spatial awareness.
- **Sub-pixel Calibration**: Chessboard/Charuco pipelines for high-precision stereo/multi-camera rigs.
- **Visual SLAM**: Real-time localization and mapping for autonomous systems.

## 模式

### 1. Text-Guided Vision Pipelines
- Use SAM 3's text-to-mask capability to isolate specific parts during inspection without needing custom detectors for every variation.
- Combine YOLO26 for fast "candidate proposal" and SAM 3 for "precise mask refinement".

### 2. 部署-First Design
- Leverage YOLO26's simplified ONNX/TensorRT exports (NMS-free).
- Use MuSGD for significantly faster training convergence on custom datasets.

### 3. Progressive 3D Scene Reconstruction
- Integrate monocular depth maps with geometric homographies to build accurate 2.5D/3D representations of scenes.

## 反模式

- **Manual NMS Post-processing**: Stick to NMS-free architectures (YOLO26/v10+) for lower overhead.
- **Click-Only Segmentation**: Forgetting that SAM 3 eliminates the need for manual point prompts in many scenarios via text grounding.
- **Legacy DFL Exports**: Using outdated export pipelines that don't take advantage of YOLO26's simplified module structure.

## Sharp Edges (2026)

| Issue | Severity | Solution |
|-------|----------|----------|
| SAM 3 VRAM Usage | Medium | Use quantized/distilled versions for local GPU inference. |
| Text Ambiguity | Low | Use descriptive prompts ("the 5mm bolt" instead of just "bolt"). |
| Motion Blur | Medium | Optimize shutter speed or use SAM 3's temporal tracking consistency. |
| Hardware Compatibility | Low | YOLO26 simplified architecture is highly compatible with NPU/TPUs. |

## 相关技能
`ai-engineer`, `robotics-expert`, `research-engineer`, `embedded-systems`

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
