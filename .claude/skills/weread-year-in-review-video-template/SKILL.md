---
name: weread-year-in-review-video-template
description: "Weread Year In Review Video Template — Weread Year In Review Video Template 相关功能和最佳实践"
  WeRead-inspired HyperFrames video template for vertical annual reading reports,
  personal reading dashboards, book-note recaps, and shareable year-in-review
  stories. Use when users want a 9:16 HTML-to-MP4 reading report with warm paper
  texture, editorial Chinese typography, book-page metaphors, data highlights,
  and deterministic motion.
triggers:
  - "WeRead year in review"
  - "WeRead annual report"
  - "reading year in review video"
  - "annual reading report template"
  - "微信读书年度报告"
  - "读书年度总结视频"
  - "阅读年报 HyperFrames"
od:
  mode: template
  surface: video
  type: hyperframes
  platform: mobile
  preview:
    type: html
    entry: example.html
    reload: debounce-100
  design_system:
    requires: false
  outputs:
    primary: index.html
    secondary:
      - template.html
      - example.html
  example_prompt: "Create a WeRead-style 9:16 HyperFrames annual reading report video with 12 scenes, warm paper texture, book-page transitions, reading stats, notes, keywords, and a final reading persona card."
  capabilities_required:
    - file_write
---

# 微信读书年度回顾视频模板

创建用于年度阅读报告的纵向 HyperFrames 合成：微信读书、Goodreads、Readwise、Notion 阅读日志、读书会或个人学习总结。该模板将阅读时间、活跃天数、书架资产、笔记、关键词和阅读人物形象转化为可分享的 9:16 视频。

## 资源映射

```text
weread-year-in-review-video-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

`example.html` 使用的渲染 MP4 展示文件托管在
`https://repo-assets.open-design.ai/resources/videos/skills/weread-year-in-review-video-template/default-showcase.mp4`。

## 工作流

1. 将 `assets/template.html` 复制到 `index.html`。
2. 替换 `REPORT` 对象中的默认报告数据：
   - 所有者/标题
   - 阅读时长和活跃天数
   - 书架和完成统计
   - 笔记构成
   - 兴趣关键词
   - 阅读人物形象和分享语
3. 保留 12 场景时间线，除非用户要求更短的剪辑。
4. 保持微信读书启发的视觉语言：
   - 暖色纸张背景
   - 墨蓝色排版
   - 克制的微信读书绿色点缀
   - 书页、书签、高亮、笔记卡片和书架隐喻
5. 动感应像翻阅阅读日记。避免科技感幻灯片切换、弹跳 UI 效果和仪表板加载动效。
6. 保持合成确定性：
   - 直接使用 `data-start`、`data-duration` 和 `data-track-index` 属性
   - 无未播种的随机性
   - 无无限循环或 `repeat: -1`
   - 无依赖滚动、悬停、localStorage 或运行时类发现
7. 输出前对照 `references/checklist.md` 验证。

## 输出约定

输出一个简短的方向说明句，然后是一个 HTML 制品：

```xml
<artifact identifier="weread-year-in-review-video-template" type="text/html" title="微信读书年度回顾视频模板">
<!doctype html>
<html>...</html>
</artifact>
```
