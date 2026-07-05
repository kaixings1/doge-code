---
name: design-md
description: "分析 Stitch 项目并将语义设计系统综合到 DESIGN.md 文件中"
risk: safe
source: "https://github.com/google-labs-code/stitch-skills/tree/main/skills/design-md"
date_added: "2026-02-27"
---

# Stitch DESIGN.md 技能

您是设计系统负责人专家。您的目标是分析所提供的技术资产并将"语义设计系统"综合到名为 `DESIGN.md` 的文件中。

## 何时使用此技能

在以下情况下使用此技能：
- 分析 Stitch 项目
- 创建 DESIGN.md 文件
- 综合语义设计系统
- 处理 Stitch 设计语言
- 为 Stitch 项目生成本设计文档

## 概述

This skill helps you create `DESIGN.md` files that serve as the "source of truth" for prompting Stitch to generate new screens that align perfectly with existing design language. Stitch interprets design through "Visual Descriptions" supported by specific color values.

## 前提条件

- Access to the Stitch MCP Server
- A Stitch project with at least one designed screen
- Access to the Stitch Effective Prompting Guide: https://stitch.withgoogle.com/docs/learn/prompting/

## The Goal

The `DESIGN.md` file will serve as the "source of truth" for prompting Stitch to generate new screens that align perfectly with the existing design language. Stitch interprets design through "Visual Descriptions" supported by specific color values.

## Retrieval and Networking

To analyze a Stitch project, you must retrieve screen metadata and design assets using the Stitch MCP Server tools:

1. **Namespace discovery**: Run `list_tools` to find the Stitch MCP prefix. Use this prefix (e.g., `mcp_stitch:`) for all subsequent calls.

2. **Project lookup** (if Project ID is not provided):
   - Call `[prefix]:list_projects` with `filter: "view=owned"` to retrieve all user projects
   - Identify the target project by title or URL pattern
   - Extract the Project ID from the `name` field (e.g., `projects/13534454087919359824`)

3. **Screen lookup** (if Screen ID is not provided):
   - Call `[prefix]:list_screens` with the `projectId` (just the numeric ID, not the full path)
   - Review screen titles to identify the target screen (e.g., "Home", "Landing Page")
   - Extract the Screen ID from the screen's `name` field

4. **Metadata fetch**: 
   - Call `[prefix]:get_screen` with both `projectId` and `screenId` (both as numeric IDs only)
   - This returns the complete screen object including:
     - `screenshot.downloadUrl` - Visual reference of the design
     - `htmlCode.downloadUrl` - Full HTML/CSS source code
     - `width`, `height`, `deviceType` - Screen dimensions and target platform
     - Project metadata including `designTheme` with color and style information

5. **Asset download**:
   - Use `web_fetch` or `read_url_content` to download the HTML code from `htmlCode.downloadUrl`
   - Optionally download the screenshot from `screenshot.downloadUrl` for visual reference
   - Parse the HTML to extract Tailwind classes, custom CSS, and component patterns

6. **Project metadata extraction**:
   - Call `[prefix]:get_project` with the project `name` (full path: `projects/{id}`) to get:
     - `designTheme` object with color mode, fonts, roundness, custom colors
     - Project-level design guidelines and descriptions
     - Device type preferences and layout principles

## Analysis & Synthesis Instructions

### 1. Extract Project Identity (JSON)
- Locate the Project Title
- Locate the specific Project ID (e.g., from the `name` field in the JSON)

### 2. Define the Atmosphere (Image/HTML)
Evaluate the screenshot and HTML structure to capture the overall "vibe." Use evocative adjectives to describe the mood (e.g., "Airy," "Dense," "Minimalist," "Utilitarian").

### 3. Map the Color Palette (Tailwind Config/JSON)
Identify the key colors in the system. For each color, provide:
- A descriptive, natural language name that conveys its character (e.g., "Deep Muted Teal-Navy")
- The specific hex code in parentheses for precision (e.g., "#294056")
- Its specific functional role (e.g., "Used for primary actions")

### 4. Translate Geometry & Shape (CSS/Tailwind)
Convert technical `border-radius` and layout values into physical descriptions:
- Describe `rounded-full` as "Pill-shaped"
- Describe `rounded-lg` as "Subtly rounded corners"
- Describe `rounded-none` as "Sharp, squared-off edges"

### 5. Describe Depth & Elevation
Explain how the UI handles layers. Describe the presence and quality of shadows (e.g., "Flat," "Whisper-soft diffused shadows," or "Heavy, high-contrast drop shadows").

## Output Guidelines

- **Language:** Use descriptive design terminology and natural language exclusively
- **Format:** Generate a clean Markdown file following the structure below
- **Precision:** Include exact hex codes for colors while using descriptive names
- **Context:** Explain the "why" behind design decisions, not just the "what"

## Output Format (DESIGN.md Structure)

```markdown
# Design System: [Project Title]
**Project ID:** [Insert Project ID Here]

## 1. Visual Theme & Atmosphere
(Description of the mood, density, and aesthetic philosophy.)

## 2. Color Palette & Roles
(List colors by Descriptive Name + Hex Code + Functional Role.)

## 3. Typography Rules
(Description of font family, weight usage for headers vs. body, and letter-spacing character.)

## 4. Component Stylings
* **Buttons:** (Shape description, color assignment, behavior).
* **Cards/Containers:** (Corner roundness description, background color, shadow depth).
* **Inputs/Forms:** (Stroke style, background).

## 5. Layout Principles
(Description of whitespace strategy, margins, and grid alignment.)
```

## Usage Example

To use this skill for the Furniture Collection project:

1. **Retrieve project information:**
   ```
   Use the Stitch MCP Server to get the Furniture Collection project
   ```

2. **Get the Home page screen details:**
   ```
   Retrieve the Home page screen's code, image, and screen object information
   ```

3. **Reference best practices:**
   ```
   Review the Stitch Effective Prompting Guide at:
   https://stitch.withgoogle.com/docs/learn/prompting/
   ```

4. **Analyze and synthesize:**
   - Extract all relevant design tokens from the screen
   - Translate technical values into descriptive language
   - Organize information according to the DESIGN.md structure

5. **Generate the file:**
   - Create `DESIGN.md` in the project directory
   - Follow the prescribed format exactly
   - Ensure all color codes are accurate
   - Use evocative, designer-friendly language

## 最佳实践

- **Be Descriptive:** Avoid generic terms like "blue" or "rounded." Use "Ocean-deep Cerulean (#0077B6)" or "Gently curved edges"
- **Be Functional:** Always explain what each design element is used for
- **Be Consistent:** Use the same terminology throughout the document
- **Be Visual:** Help readers visualize the design through your descriptions
- **Be Precise:** Include exact values (hex codes, pixel values) in parentheses after natural language descriptions

## Tips for Success

1. **Start with the big picture:** Understand the overall aesthetic before diving into details
2. **Look for patterns:** Identify consistent spacing, sizing, and styling patterns
3. **Think semantically:** Name colors by their purpose, not just their appearance
4. **Consider hierarchy:** Document how visual weight and importance are communicated
5. **Reference the guide:** Use language and patterns from the Stitch Effective Prompting Guide

## Common Pitfalls to Avoid

- ❌ Using technical jargon without translation (e.g., "rounded-xl" instead of "generously rounded corners")
- ❌ Omitting color codes or using only descriptive names
- ❌ Forgetting to explain functional roles of design elements
- ❌ Being too vague in atmosphere descriptions
- ❌ Ignoring subtle design details like shadows or spacing patterns

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
