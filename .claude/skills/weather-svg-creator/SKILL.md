---
name: weather-svg-creator
description: 天气SVG创建工具
---

# 天气 SVG 创建技能

为阿联酋迪拜创建一个可视化的 SVG 天气卡片并写入输出文件。

## 任务

你将收到来自调用上下文的温度值和单位（摄氏度或华氏度）。创建一个 SVG 天气卡片并写入 SVG 和 markdown 摘要。

## 指令

1. **创建 SVG**——使用 [reference.md](reference.md) 中的 SVG 模板，替换占位符为实际值
2. **写入 SVG 文件**——读取然后写入到 `orchestration-工作流/weather.svg`
3. **写入摘要**——读取然后写入到 `orchestration-工作流/output.md`，使用 [reference.md](reference.md) 中的 markdown 模板

## 规则

- 使用提供的精确温度值和单位——不要重新获取或修改
- SVG 必须是自包含且有效的
- 两个输出文件都放在 `orchestration-工作流/` 目录下

## 其他资源

- SVG 模板、输出模板和设计规范，请参见 [reference.md](reference.md)
- 输入/输出示例，请参见 [示例.md](示例.md)
