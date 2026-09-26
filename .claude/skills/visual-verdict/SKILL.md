---
name: visual-verdict
description: 截图与参考对比的结构化视觉 QA 判决。
level: 2
---

<Purpose>
使用本技能将生成的 UI 截图与一张或多张参考图进行对比，并返回严格的 JSON 判决，用于驱动下一轮编辑迭代。
</Purpose>

<Use_When>
- 任务包含视觉保真度要求（布局、间距、排版、组件样式）
- 你已有生成的截图，以及至少一张参考图
- 你需要在继续编辑之前获得确定性的通过/不通过指引
</Use_When>

<Inputs>
- `reference_images[]`（一张或多张图片路径）
- `generated_screenshot`（当前输出图片）
- 可选：`category_hint`（例如 `hackernews`、`sns-feed`、`dashboard`）
</Inputs>

<Output_Contract>
只返回 **JSON**，且必须严格符合以下结构：

```json
{
  "score": 0,
  "verdict": "revise",
  "category_match": false,
  "differences": ["..."],
  "suggestions": ["..."],
  "reasoning": "简短说明"
}
```

规则：
- `score`：0-100 的整数
- `verdict`：简短状态（`pass`、`revise` 或 `fail`）
- `category_match`：当生成的截图与预期的 UI 类别/风格一致时为 `true`
- `differences[]`：具体的视觉不一致项（布局、间距、排版、颜色、层级）
- `suggestions[]`：与这些差异相对应的、可执行的下一步编辑
- `reasoning`：1-2 句话的总结

<Threshold_And_Loop>
- 目标通过阈值为 **90+**。
- 如果 `score < 90`，请继续编辑，并在进行任何进一步的视觉复核之前重新运行 `/oh-my-claudecode:visual-verdict`。
- 在下一次截图达到该阈值之前，**不要**将视觉任务视为已完成。
</Threshold_And_Loop>

<Debug_Visualization>
当不一致难以定位时：
1. 以 `$visual-verdict` 作为权威判决。
2. 使用像素级差异工具（pixel diff / pixelmatch 叠加图）作为**辅助调试手段**，用来定位热点区域。
3. 将像素差异热点转化为具体的 `differences[]` 和 `suggestions[]` 更新。
</Debug_Visualization>

<Example>
```json
{
  "score": 87,
  "verdict": "revise",
  "category_match": true,
  "differences": [
    "顶部导航间距比参考图更紧凑",
    "主按钮使用的字重偏小"
  ],
  "suggestions": [
    "将导航项的水平内边距增加 4px",
    "将主按钮的 font-weight 设为 600"
  ],
  "reasoning": "核心布局一致，但样式细节仍有偏差。"
}
```
</Example>

任务：{{ARGUMENTS}}
