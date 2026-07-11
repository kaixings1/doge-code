---
name: 视频摘要生成器
description: "视频摘要生成器 — 使用 Gemini API 分析本地 MP4 视频文件并生成结构化的 Markdown 摘要。支持自定义提示词提取特定信息。"
  Use when the user wants to summarize, analyze, or extract key points from video files in bulk.
  Triggers on requests like "summarize my videos", "create markdown summaries for the videos",
  "analyze videos with Gemini", "generate video summaries", or "extract X from my videos".
  需要 GEMINI_API_KEY environment variable set in the system.
---

# Video Summarizer

Analyzes MP4 files in a directory via the Gemini API and writes a `.md` summary file next to each video.

## 前提条件

- `GEMINI_API_KEY` env var must be set
- `google-genai` installed: `py -m pip install google-genai`
- Python available as `py` (Windows) or `python3`

## 工作流

### 1. Determine the prompt

Check if the user provided a custom prompt or specific extraction instructions.

- **No custom prompt** -> use the default (structured summary with Title, 总结, Key Points, Takeaways)
- **User provides custom instructions** -> pass them via `--prompt` or `--prompt-file`

A custom prompt **completely replaces** the default. 示例s of custom prompts:
- "Extract all mentioned tools, their prices, and a one-line description for each"
- "List every action item and deadline mentioned in this video"
- "Create a transcript outline with timestamps"

### 2. Run the script

```bash
# Default summary — all videos in current directory (recursive)
py scripts/summarize_videos.py

# Default summary — specific directory
py scripts/summarize_videos.py "C:/path/to/videos"

# Custom prompt (inline) — replaces default summary format
py scripts/summarize_videos.py --prompt "Extract all product names and prices mentioned"

# Custom prompt (from file) — replaces default summary format
py scripts/summarize_videos.py --prompt-file my-prompt.txt

# Both directory and custom prompt
py scripts/summarize_videos.py "C:/path/to/videos" --prompt "List all key decisions made"
```

### 3. How Claude should handle user arguments

When the user invokes this skill:

1. If the user specifies a **custom prompt or extraction goal** (e.g., "extract all tools mentioned",
   "summarize focusing on pricing", "list action items"), pass it via `--prompt "..."`.
2. If the user provides a **prompt file path**, pass it via `--prompt-file path/to/file.txt`.
3. If the user gives **no specific instructions**, run without `--prompt` to use the default format.
4. If the user specifies a **directory**, pass it as the first positional 参数.

### 4. 默认 output format (when no custom prompt is given)

```markdown
# [Video Title]

## 总结
[2-3 sentence description]

## Key Points
- point 1
- point 2
- ...

## Core Content & Takeaways
[Central message and key insight]
