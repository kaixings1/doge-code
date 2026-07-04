---
name: 2slides-ppt-generator
description: "基于 AI 的演示文稿生成 — 通过 2slides API 从文本创建幻灯片、匹配参考图片样式、将文档总结为演示文稿、添加 AI 语音旁白并导出页面/音频。适用于"制作幻灯片"、"创建演示文稿"或"从此文档生成幻灯片"的请求。"
category: api-integration
risk: safe
source: community
source_repo: 2slides/slides-generation-2slides-skills
source_type: community
date_added: "2026-06-05"
author: 2slides
tags: [presentations, slides, powerpoint, ai, api-integration, pdf, narration, document-summarization]
tools: [claude, cursor, gemini, codex, antigravity]
plugin:
  setup:
    type: manual
    summary: "Install Python requirements and configure a 2slides API key before running generation scripts."
    docs: SKILL.md
---

# 2slides 演示文稿生成

## 概述

使用 2slides AI API 生成专业的演示文稿。该技能支持基于内容的生成（主题驱动的快速PPT）、参考图像样式匹配、自定义PDF设计、文档摘要、AI语音旁白以及导出页面/音频。它返回交互式幻灯片URL和可下载的PDF。

此技能改编自官方的 2slides 技能仓库 ([`2slides/slides-generation-2slides-skills`](https://github.com/2slides/slides-generation-2slides-skills))。它调用托管的 2slides API，需要用户自己的API密钥和积分。

## 何时使用此技能

- 当用户要求从文本或大纲"创建演示文稿"、"制作幻灯片"或"生成演示文稿"时使用。
- 当用户想要与参考图像样式匹配的幻灯片时使用（"创建像这张图片一样的幻灯片"）。
- 当用户想要自定义设计的PDF幻灯片而无需参考图像时使用。
- 当用户上传文档并要求"从此文档创建幻灯片"时使用。
- 当用户想要为生成的幻灯片添加AI语音旁白，或将幻灯片导出为PNG图像并将旁白导出为WAV音频时使用。
- 当用户询问"有哪些主题可用？"或想要浏览/选择主题时使用。

## 设置要求

用户必须拥有 2slides API 密钥和积分：

1. **获取API密钥：** 访问 https://2slides.com/api 创建账户和API密钥
   - 新用户获得**500免费积分**（约50页快速PPT）
2. **购买积分（可选）：** 访问 https://2slides.com/pricing 购买额外积分
   - 按需付费，无需订阅
   - 积分永不过期
   - 大额套餐最高可享20%折扣
3. **设置API密钥：** 将密钥存储在环境变量中：`SLIDES_2SLIDES_API_KEY`

```bash
read -r -s SLIDES_2SLIDES_API_KEY
export SLIDES_2SLIDES_API_KEY
```

4. **安装脚本依赖：** 在使用Python脚本之前，从此技能目录安装固定的本地要求：

```bash
python -m pip install -r requirements.txt
```

**积分成本：**
- 快速PPT：10积分/页
- Nano Banana 1K/2K：100积分/页
- Nano Banana 4K：200积分/页
- 语音旁白：210积分/页
- 下载导出：免费

有关详细定价信息，请参阅 [references/pricing.md](references/pricing.md)。

## 工作流程决策树

根据用户的请求选择适当的方法：

```
用户请求
│
├─ "从此内容/文本创建幻灯片"
│  └─> 使用基于内容的生成（第1节）
│
├─ "创建像这张图片一样的幻灯片"
│  └─> 使用参考图像生成（第2节）
│
├─ "创建自定义设计的幻灯片" 或 "创建PDF幻灯片"
│  └─> 使用自定义PDF生成（第3节）
│
├─ "从此文档创建幻灯片"
│  └─> 使用文档摘要（第4节）
│
├─ "添加语音旁白" 或 "为幻灯片生成音频"
│  └─> 使用语音旁白（第5节）
│
├─ "将幻灯片下载为图像" 或 "导出幻灯片和语音"
│  └─> 使用下载导出（第6节）
│
└─ "搜索主题" 或 "有哪些主题可用？"
   └─> 使用主题搜索（第7节）
```

---

## 1. 基于内容的生成

从用户提供的文本内容生成幻灯片。

### 何时使用
- 用户在消息中直接提供内容
- 用户说"创建关于X的演示文稿"
- 用户提供结构化大纲或要点

### 工作流程

**步骤 1：准备内容**

为获得最佳结果，清晰构建内容结构：

```
标题：[主要主题]

第1部分：[子主题]
- 关键点1
- 关键点2
- 关键点3

第2部分：[子主题]
- 关键点1
- 关键点2
```

**步骤 2：选择主题（必需）**

搜索适当的主题（themeId是必需的）：

```bash
python scripts/search_themes.py --query "business"
python scripts/search_themes.py --query "professional"
python scripts/search_themes.py --query "creative"
```

从结果中选择主题ID。

**步骤 3：生成幻灯片**

使用 `generate_slides.py` 脚本和主题ID：

```bash
# 基本生成（需要主题ID）
python scripts/generate_slides.py --content "您的内容在此" --theme-id "theme123"

# 使用不同语言
python scripts/generate_slides.py --content "您的内容" --theme-id "theme123" --language "Spanish"

# 异步模式适用于较长演示文稿
python scripts/generate_slides.py --content "您的内容" --theme-id "theme123" --mode async
```

**步骤 4：处理结果**

**同步模式响应：**
```json
{
  "slideUrl": "https://2slides.com/slides/abc123",
  "pdfUrl": "https://2slides.com/slides/abc123/download",
  "status": "completed"
}
```

向用户提供两个URL：
- `slideUrl`：交互式在线幻灯片
- `pdfUrl`：可下载的PDF版本

**异步模式响应：**
```json
{
  "jobId": "job123",
  "status": "pending"
}
```

轮询结果：
```bash
python scripts/get_job_status.py --job-id "job123"
```

---

## 2. 参考图像生成

Generate slides that match the style of a reference image.

### 何时使用
- User provides an image URL and says "create slides like this"
- User wants to match existing brand/design style
- User has a template image they want to emulate

### 工作流程

**Step 1: Verify Image URL**

Ensure the reference image is:
- Publicly accessible URL
- Valid image format (PNG, JPG, etc.)
- Represents the desired slide style

**Step 2: Generate Slides**

Use the `generate_slides.py` script with `--reference-image`:

```bash
python scripts/generate_slides.py \
  --content "Your presentation content" \
  --reference-image "https://example.com/template.jpg" \
  --language "Auto"
```

**Optional parameters (all values from [2slides API](https://2slides.com/api.md)):**
```bash
--language LANG                 # Auto, English, Spanish, Arabic, Portuguese, Indonesian,
                                 # Japanese, Russian, Hindi, French, German, Greek, Vietnamese,
                                 # Turkish, Polish, Italian, Korean, Simplified Chinese,
                                 # Traditional Chinese, Thai (default: Auto)
--mode sync|async                # default: sync for theme, async for reference-image
--aspect-ratio RATIO             # 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 (default: 16:9)
--resolution 1K|2K|4K            # default: 2K
--page N                         # 0=auto, 1-100 (default: 1)
--content-detail concise|standard # default: concise
```

**Note:** This uses Nano Banana Pro mode with credit costs:
- 1K/2K: 100 credits per page
- 4K: 200 credits per page

**Step 3: Handle Results**

This mode always runs synchronously and returns:
```json
{
  "slideUrl": "https://2slides.com/workspace?jobId=...",
  "pdfUrl": "https://...pdf...",
  "status": "completed",
  "message": "Successfully generated N slides",
  "slidePageCount": N
}
```

Provide both URLs to the user:
- `slideUrl`: View slides in 2slides workspace
- `pdfUrl`: Direct PDF download (expires in 1 hour)

**Processing time:** ~30 seconds per page (30-60 seconds typical for 1-2 pages)

---

## 3. 自定义PDF生成

Generate custom-designed slides from text without needing a reference image.

### 何时使用
- User wants custom design without providing a reference image
- User requests "create PDF slides"
- User wants to specify design characteristics
- Alternative to theme-based generation with more design flexibility

### 工作流程

**Step 1: Prepare Content**

Structure the content clearly:

```
Title: [Main Topic]

Section 1: [Subtopic]
- Key point 1
- Key point 2

Section 2: [Subtopic]
- Key point 1
- Key point 2
```

**Step 2: Generate Slides**

Use the `create_pdf_slides.py` script:

```bash
# Basic generation
python scripts/create_pdf_slides.py --content "Your content here"

# With design style (API: designStyle)
python scripts/create_pdf_slides.py \
  --content "Sales Report Q4 2025" \
  --design-style "modern minimalist, blue color scheme"

# High resolution with auto page detection
python scripts/create_pdf_slides.py \
  --content "Marketing Plan" \
  --resolution 4K \
  --page 0 \
  --content-detail standard
```

**Optional parameters:**
```bash
--design-style "text"           # Design instructions (API: designStyle)
--language LANG                 # Same as generate_slides (default: Auto)
--aspect-ratio RATIO           # 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 (default: 16:9)
--resolution 1K|2K|4K          # default: 2K
--page N                        # 0=auto, 1-100 (default: 1)
--content-detail concise|standard # default: standard
```

**Step 3: Handle Results**

Returns same structure as create-like-this:
```json
{
  "slideUrl": "https://2slides.com/workspace?jobId=...",
  "pdfUrl": "https://...pdf...",
  "status": "completed",
  "message": "Successfully generated N slides",
  "slidePageCount": N
}
```

**Notes:**
- Same credit costs as create-like-this (100 credits/page for 1K/2K, 200 for 4K)
- Processing time: ~30 seconds per page
- Automatically generates PDF
- Uses AI to create custom design based on content and specs

---

## 4. 文档摘要

Generate slides from document content.

### 何时使用
- User uploads a document (PDF, DOCX, TXT, etc.)
- User says "create slides from this document"
- User wants to summarize long content into presentation format

### 工作流程

**Step 1: Read Document**

Use appropriate tool to read the document content:
- PDF: Use PDF reading tools
- DOCX: Use DOCX reading tools
- TXT/MD: Use Read tool

**Step 2: Extract Key Points**

Analyze the document and extract:
- Main topics and themes
- Key points for each section
- Important data, quotes, or examples
- Logical flow and structure

**Step 3: Structure Content**

Format extracted information into presentation structure:

```
Title: [Document Main Topic]

Introduction
- Context
- Purpose
- Overview

[Section 1 from document]
- Key point 1
- Key point 2
- Supporting detail

[Section 2 from document]
- Key point 1
- Key point 2
- Supporting detail

Conclusion
- Summary
- Key takeaways
- Next steps
```

**Step 4: Generate Slides**

Use content-based generation workflow (Section 1). First search for a theme, then generate:

```bash
# Search for appropriate theme
python scripts/search_themes.py --query "business"

# Generate with theme ID
python scripts/generate_slides.py --content "[Structured content from step 3]" --theme-id "theme123"
```

**Tips:**
- Keep slides concise (3-5 points per slide)
- Focus on key insights, not full text
- Use document headings as slide titles
- Include important statistics or quotes
- Ask user if they want specific sections highlighted

---

## 5. 语音旁白

Add AI-generated voice narration to slides.

### 何时使用
- User wants to add audio to slides
- User requests "add voice narration" or "generate audio"
- User wants presentations with spoken content
- User needs multi-speaker narration

### 先决条件

**IMPORTANT:** The slide generation job must be completed before adding narration.

1. Generate slides first using any method (Section 1, 2, 3, or 4)
2. Get the job ID from the generation result
3. Ensure job status is "completed" before requesting narration

### 工作流程

**Step 1: Choose Voice**

30 voices available including:
- Puck (default)
- Aoede
- Charon
- Kore
- Fenrir
- Phoebe
- And 24 more...

List all voices:
```bash
python scripts/generate_narration.py --list-voices
```

**Step 2: Generate Narration**

Use the `generate_narration.py` script with the job ID:

```bash
# Basic narration with default voice
python scripts/generate_narration.py --job-id "abc-123-def-456"

# Single speaker, specific voice
python scripts/generate_narration.py --job-id "abc-123-def-456" --voice Aoede

# Multi-speaker mode
python scripts/generate_narration.py --job-id "abc-123-def-456" --multi-speaker
```

**Parameters (aligned with [2slides API](https://2slides.com/api.md)):**
- `--job-id`: Job ID (required, UUID for Nano Banana)
- `--voice`: Voice name (default: Puck); use `--list-voices` for all 30
- `--language`: Narration language (default: Auto)
- `--multi-speaker`: Enable multi-speaker mode
- `--list-voices`: Print the supported voices without calling the API

**Step 3: Check Status**

Narration generation runs asynchronously:

```bash
python scripts/get_job_status.py --job-id "abc-123-def-456"
```

**Step 4: Handle Results**

Once completed, the job will include narration files. Use download endpoint (Section 6) to get audio files.

**Notes:**
- **Cost:** 210 credits per page (10 for text, 200 for audio)
- Processing time varies by slide count
- 30 voice options available
- Supports 19 languages plus auto-detection
- Multi-speaker mode uses different voices for variety

---

## 6. 下载导出

Download slides as PNG images and voice narrations as WAV files.

### 何时使用
- User wants to download slides as images
- User needs voice files separately
- User wants transcripts
- User needs slides in image format for other tools

### 工作流程

**Step 1: Verify Job Complete**

Ensure slides (and optionally narration) are generated and job is completed.

**Step 2: Download Archive**

Use the `download_slides_pages_voices.py` script:

```bash
# Download with default filename (<job_id>.zip)
python scripts/download_slides_pages_voices.py --job-id "abc-123-def-456"

# Download to specific path
python scripts/download_slides_pages_voices.py \
  --job-id "abc-123-def-456" \
  --output "my-presentation.zip"
```

**Step 3: Extract Contents**

The ZIP archive contains:
- **Pages:** PNG files for each slide
- **Voices:** WAV audio files (if narration was generated)
- **Transcripts:** Text transcripts of narration

**Notes:**
- **Cost:** Completely FREE (no credits used)
- Download URLs valid for **1 hour only**
- Includes all pages and voice files
- High quality PNG export
- WAV format for audio

---

## 7. 主题搜索

Find appropriate themes for presentations.

### 何时使用
- Before generating slides with specific styling
- User asks "what themes are available?"
- User wants professional or branded appearance

### 工作流程

**Search themes:**

```bash
# Search for specific style (query is required)
python scripts/search_themes.py --query "business"
python scripts/search_themes.py --query "creative"
python scripts/search_themes.py --query "education"
python scripts/search_themes.py --query "professional"

# Get more results
python scripts/search_themes.py --query "modern" --limit 50
```

**Theme selection:**

1. Show user available themes with names and descriptions
2. Ask user to choose or let them use default
3. Use the theme ID in generation request

---

## 使用MCP服务器

If the 2slides MCP server is configured in Claude Desktop, use the integrated tools instead of scripts.

**Two Configuration Modes:**

1. **Streamable HTTP Protocol (Recommended)**
   - Simplest setup, no local installation
   - Configure: `"url": "https://2slides.com/api/mcp?apikey=YOUR_API_KEY"`

2. **NPM Package (stdio)**
   - Uses local npm package
   - Configure: `"command": "npx", "args": ["2slides-mcp"]`

**Available MCP tools:**
- `slides_generate` - Generate slides from content
- `slides_create_like_this` - Generate from reference image
- `themes_search` - Search themes
- `jobs_get` - Check job status

See [mcp-integration.md](references/mcp-integration.md) for complete setup instructions and detailed tool documentation.

**When to use MCP vs scripts:**
- **Use MCP** in Claude Desktop when configured
- **Use scripts** in Claude Code CLI or when MCP not available

---

## 高级功能

### Sync vs Async Mode

**Sync Mode (default):**
- Waits for generation to complete (30-60 seconds)
- Returns results immediately
- Best for quick presentations

**Async Mode:**
- Returns job ID immediately
- Poll for results with `get_job_status.py`
- Best for large presentations or batch processing
- **Recommended polling:** Check every 20-30 seconds to avoid server strain

### 速率限制

Different endpoints have different rate limits:

- **Fast PPT (generate):** 10 requests per minute
- **Nano Banana (create-like-this, create-pdf-slides):** 6 requests per minute

If rate limited, wait before retrying or check plan limits.

### 积分成本

- **Fast PPT (generate endpoint):** 10 credits per page
- **Nano Banana 1K/2K (create-like-this, create-pdf-slides):** 100 credits per page
- **Nano Banana 4K:** 200 credits per page
- **Voice Narration:** 210 credits per page (10 for text, 200 for audio)
- **Download Export:** FREE (no credits)

### 购买积分

2slides uses a pay-as-you-go credit system with no subscriptions required.

**Credit Packages:** (Current promotion: up to 20% off)
- 2,000 credits: $5.00
- 4,000 credits: $9.50 (5% off)
- 10,000 credits: $22.50 (10% off)
- 20,000 credits: $42.50 (15% off)
- 40,000 credits: $80.00 (20% off)

**New users receive 500 free credits** for onboarding (~50 Fast PPT pages).

**Credits never expire** - use them at your own pace.

**Purchase credits at:** https://2slides.com/pricing

### 下载URL过期时间

All download URLs (PDF, ZIP archives) are valid for **1 hour only**. Download files promptly after generation.

### 语言支持

Generate slides in multiple languages (use full language name):

```bash
--language "Auto"                # Automatic detection (default)
--language "English"             # English
--language "Simplified Chinese"  # 简体中文
--language "Traditional Chinese" # 繁體中文
--language "Spanish"             # Español
--language "French"              # Français
--language "German"              # Deutsch
--language "Japanese"            # 日本語
--language "Korean"              # 한국어
```

And more: Arabic, Portuguese, Indonesian, Russian, Hindi, Vietnamese, Turkish, Polish, Italian

### 错误处理

**Common error codes:**

1. **Missing API key**
   ```
   Error: API key not found
   Solution: Set SLIDES_2SLIDES_API_KEY environment variable
   ```

2. **RATE_LIMIT_EXCEEDED**
   ```
   Error: 429 Too Many Requests
   Solution: Wait 20-30 seconds before retrying
   Rate limits: Fast PPT (10/min), Nano Banana (6/min)
   ```

3. **INSUFFICIENT_CREDITS**
   ```
   Error: Not enough credits
   Solution: Add credits at https://2slides.com/api
   ```

4. **INVALID_JOB_ID**
   ```
   Error: Job ID not found or invalid
   Solution: Verify job ID format (must be UUID for Nano Banana)
   ```

5. **Invalid content**
   ```
   Error: 400 Bad Request
   Solution: Verify content format and parameters
   ```

---

## 脚本参数参考（2slides API）

All scripts accept parameters that match [2slides API](https://2slides.com/api.md). Allowed values are defined in `scripts/api_constants.py` and enforced where applicable.

| Script | Key parameters | Allowed values (see script `--help` or api_constants.py) |
|--------|----------------|----------------------------------------------------------|
| `generate_slides.py` | `--language` | Auto, English, Spanish, Arabic, Portuguese, Indonesian, Japanese, Russian, Hindi, French, German, Greek, Vietnamese, Turkish, Polish, Italian, Korean, Simplified Chinese, Traditional Chinese, Thai |
| | `--mode` | sync, async |
| | `--aspect-ratio` | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 |
| | `--resolution` | 1K, 2K, 4K |
| | `--content-detail` | concise, standard |
| `create_pdf_slides.py` | Same as above + `--design-style` / `--design-spec` (free text) | |
| `generate_narration.py` | `--voice` | 30 voices (Puck, Aoede, Charon, …); use `--list-voices` |
| | `--language` | Auto, English, Spanish, Arabic, Portuguese, Indonesian, Japanese, Russian, Hindi, French, German, Vietnamese, Turkish, Polish, Italian, Korean, Simplified Chinese, Traditional Chinese |
| | `--multi-speaker` | enabled when present |
| `search_themes.py` | `--query` (required), `--limit` (1–100) | |
| `get_job_status.py` | `--job-id` (required) | |
| `download_slides_pages_voices.py` | `--job-id` (required), `--output` (path) | |

---

## 附加文档

### API Reference
See [api-reference.md](references/api-reference.md) for:
- All endpoints and parameters
- Request/response formats
- Authentication details
- Rate limits and best practices
- Error codes and handling

### Pricing Information
See [pricing.md](references/pricing.md) for:
- Credit packages and pricing
- Cost examples and calculations
- Free trial details
- Refund policy
- Enterprise options

---

## 最佳结果提示

**Content Structure:**
- Use clear headings and subheadings
- Keep bullet points concise
- Limit to 3-5 points per section
- Include relevant examples or data

**Theme Selection:**
- Theme ID is required for standard generation
- Search with keywords matching presentation purpose
- Common searches: "business", "professional", "creative", "education", "modern"
- Each theme has unique styling and layout

**Reference Images:**
- Use high-quality images for best results
- Can use URL or base64 encoded image
- Public URL must be accessible
- Consider resolution setting (1K/2K/4K) based on quality needs
- Use page=0 for automatic slide count detection

**Document Processing:**
- Extract only key information
- Don't try to fit entire document in slides
- Focus on main insights and takeaways
- Ask user which sections to emphasize

---

## 安全注意事项

- **Credentials:** This skill reads the API key from the `SLIDES_2SLIDES_API_KEY` environment variable. Never hard-code the key in commands, commit it, or echo it back to the user. The scripts send it as a bearer/`apikey` value to `https://2slides.com` over HTTPS only.
- **Network + paid mutations:** Every generation call makes an outbound network request to the 2slides API and **spends the user's credits** (10–210 credits/page depending on mode). Treat generation, reference-image, custom-PDF, and narration calls as billable actions — confirm intent before generating large or high-resolution (4K) decks, and surface the expected page count/cost when it is non-trivial.
- **No destructive local actions:** The scripts only read content/files the user points to and write generated output (e.g. a downloaded ZIP) to the path the user specifies. They do not modify or delete unrelated files.
- **Input handling:** Reference-image and document inputs are sent to the 2slides service for processing. Do not submit confidential material the user has not authorized for third-party processing.
- **Download URLs expire in 1 hour** — fetch artifacts promptly and do not treat the URLs as durable storage.

## 限制

- Requires a valid 2slides account, API key, and sufficient credits; this skill does not provision or pay for credits.
- Results are AI-generated drafts intended as a starting point, not a final, fact-checked deliverable — review content before use.
- This skill does not replace environment-specific validation or expert review. Stop and ask for clarification if the API key, required inputs, or intended cost/scope are missing.
- Rate limits apply (Fast PPT 10/min, Nano Banana 6/min); poll async jobs every 20–30s rather than tight-looping.

## 相关技能

- `@youtube-full` — fetch source material (transcripts) that can be summarized into a deck with this skill.
