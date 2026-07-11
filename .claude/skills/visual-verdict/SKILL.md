---
name: 视觉裁决
description: "视觉裁决 — 视觉比较和判定相关功能和最佳实践"
level: 2
---

# 视觉裁决

<目的>
使用此技能将生成的 UI 截图与一个或多个参考图像进行比较，并返回严格的 JSON 裁决，以驱动下一次编辑迭代。
</目的>

<Use_When>
- 任务包括视觉保真度要求（布局、间距、排版、组件样式）
- 您有生成的截图和至少一个参考图像
- 在继续编辑之前需要确定性的通过/失败指导
</Use_When>

<Inputs>
- `reference_images[]` (one or more image paths)
- `generated_screenshot` (current output image)
- Optional: `category_hint` (e.g., `hackernews`, `sns-feed`, `dashboard`)
</Inputs>

<Output_Contract>
Return **JSON only** with this exact shape:

```json
{
  "score": 0,
  "verdict": "revise",
  "category_match": false,
  "differences": ["..."],
  "suggestions": ["..."],
  "reasoning": "short explanation"
}
```

Rules:
- `score`: integer 0-100
- `verdict`: short status (`pass`, `revise`, or `fail`)
- `category_match`: `true` when the generated screenshot matches the intended UI category/style
- `differences[]`: concrete visual mismatches (layout, spacing, typography, colors, hierarchy)
- `suggestions[]`: actionable next edits tied to the differences
- `reasoning`: 1-2 sentence summary

<Threshold_And_Loop>
- Target pass threshold is **90+**.
- If `score < 90`, continue editing and rerun `/oh-my-claudecode:visual-verdict` before any further visual review pass.
- Do **not** treat the visual task as complete until the next screenshot clears the threshold.
</Threshold_And_Loop>

<Debug_Visualization>
When mismatch diagnosis is hard:
1. Keep `$visual-verdict` as the authoritative decision.
2. Use pixel-level diff tooling (pixel diff / pixelmatch overlay) as a **secondary debug aid** to localize hotspots.
3. Convert pixel diff hotspots into concrete `differences[]` and `suggestions[]` updates.
</Debug_Visualization>

<Example>
```json
{
  "score": 87,
  "verdict": "revise",
  "category_match": true,
  "differences": [
    "Top nav spacing is tighter than reference",
    "Primary button uses smaller font weight"
  ],
  "suggestions": [
    "Increase nav item horizontal padding by 4px",
    "Set primary button font-weight to 600"
  ],
  "reasoning": "Core layout matches, but style details still diverge."
}
```
</Example>

Task: {{ARGUMENTS}}
