---
description: 获取迪拜天气并创建 SVG 天气卡片
model: haiku
allowed-tools:
  - AskUserQuestion
  - Agent
  - Skill
---

# 天气编排器命令

获取阿联酋迪拜的当前温度并创建可视化 SVG 天气卡片。

## 执行契约（不可协商）

你**必须**通过委托给 `weather-agent` 子智能体来完成此命令。禁止以下行为：

- 通过 Bash、WebFetch 或任何其他工具自行获取天气数据
- 跳过步骤 1（用户的温度单位偏好是智能体必需的输入）
- 在智能体返回温度之前调用 `weather-svg-creator`

如果无法调用 Agent 工具，停止并向用户报告错误。不要临时应变。

## 工作流

### 步骤 1：询问用户偏好

使用 AskUserQuestion 工具询问用户想要摄氏度还是华氏度。在继续之前记录所选单位。

### 步骤 2：通过智能体获取天气数据

使用 Agent 工具调用天气智能体：

- subagent_type: weather-agent
- description: 获取迪拜天气数据
- prompt: 获取阿联酋迪拜的当前温度，单位为[用户请求的单位]。返回数值温度和单位。智能体预装了提供详细说明的技能（weather-fetcher）。
- model: haiku

等待智能体完成并捕获返回的温度值和单位。

**故障关闭护栏**：如果智能体未返回数值温度和单位，**不要**继续到步骤 3。向用户报告失败并停止。

### 步骤 3：创建 SVG 天气卡片

使用 Skill 工具调用 weather-svg-creator 技能：

- skill: weather-svg-creator

该技能将使用步骤 2 中的温度值和单位（在当前上下文中可用）来创建 SVG 卡片并写入输出文件。

## 输出摘要

向用户提供清晰的摘要，显示：

- 请求的温度单位
- 从迪拜获取的温度
- 在 `orchestration-workflow/weather.svg` 创建的 SVG 卡片
- 写入 `orchestration-workflow/output.md` 的摘要
