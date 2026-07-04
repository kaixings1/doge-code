---
name: sora
description: "Sora — OpenAI 视频生成 API，用于创建、混剪和管理短视频片段，适用于电影镜头、B-roll 素材和快速概念视频迭代"
triggers:
  - "sora"
  - "openai video"
  - "short video"
  - "b roll"
  - "cinematic clip"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/openai/skills"
---

# Sora 视频生成

> 源自 OpenAI 技能仓库。

## 功能描述

通过 OpenAI 的 Sora API 生成、混剪和管理短视频片段。适用于电影镜头、B-roll 素材和快速概念视频迭代。

## 来源

- 上游仓库：https://github.com/openai/skills
- 类别：`video-generation`

## 使用方法

此目录条目在 Open Design 中宣传该技能，以便代理在规划期间发现它。要运行完整的上游工作流及其原始资源、脚本和参考文档，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 检查上游 README 获取确切路径
open https://github.com/openai/skills
```

然后让代理按名称（`sora`）或使用此技能 frontmatter 中列出的触发短语来调用此技能。

## Sora API 功能

### 视频生成
- 基于文本描述生成短视频
- 支持多种风格和场景
- 可控制视频长度和质量

### 视频编辑
- 视频片段混剪
- 转场效果添加
- 音频同步处理

### 概念迭代
- 快速原型视频创建
- 多版本对比
- 风格测试和优化

## 使用场景

### 内容创作
- 社交媒体短视频
- 产品演示视频
- 营销素材制作

### 原型设计
- 概念验证视频
- 用户界面动画
- 交互流程演示

### 教育培训
- 教学视频制作
- 培训材料创建
- 知识分享内容

## 技术要点

### API 集成
- OpenAI Sora API 调用
- 身份验证和配额管理
- 错误处理和重试机制

### 视频处理
- 格式转换和压缩
- 分辨率调整
- 编解码器选择

### 工作流优化
- 批量处理
- 模板化生成
- 自动化流水线

## 最佳实践

### 提示工程
- 详细的场景描述
- 风格和氛围指定
- 技术参数明确化

### 质量控制
- 分辨率选择
- 帧率优化
- 文件大小管理

### 成本优化
- 配额使用监控
- 缓存策略实施
- 批量请求优化

## 注意事项

- 遵守 OpenAI 使用政策
- 注意内容版权问题
- 考虑伦理和隐私影响
- 测试不同参数组合
- 监控 API 使用成本
