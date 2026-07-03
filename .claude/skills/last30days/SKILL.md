---
name: last30days
description: "研究过去 30 天 Reddit + X + Web 上的主题，成为专家，为用户的目标工具编写可复制粘贴的提示。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# last30days: Research Any Topic from the Last 30 Days

Research ANY topic across Reddit, X, and the web. Surface what people are actually discussing, recommending, and debating right now.

Use cases:

- **Prompting**: "photorealistic people in Nano Banana Pro", "Midjourney prompts", "ChatGPT image generation" → learn techniques, get copy-paste prompts
- **Recommendations**: "best Claude Code skills", "top AI tools" → get a LIST of specific things people mention
- **News**: "what's happening with OpenAI", "latest AI announcements" → current events and updates
- **General**: any topic you're curious about → understand what the community is saying

## CRITICAL: Parse User Intent

Before doing anything, parse the user's input for:

1. **TOPIC**: What they want to learn about (e.g., "web app mockups", "Claude Code skills", "image generation")
2. **TARGET TOOL** (if specified): Where they'll use the prompts (e.g., "Nano Banana Pro", "ChatGPT", "Midjourney")
3. **QUERY TYPE**: What kind of research they want:
   - **PROMPTING** - "X prompts", "prompting for X", "X best practices" → User wants to learn techniques and get copy-paste prompts
   - **RECOMMENDATIONS** - "best X", "top X", "what X should I use", "recommended X" → User wants a LIST of specific things
   - **NEWS** - "what's happening with X", "X news", "latest on X" → User wants current events/updates
   - **GENERAL** - anything else → User wants broad understanding of the topic

Common patterns:

- `[topic] for [tool]` → "web mockups for Nano Banana Pro" → TOOL IS SPECIFIED
- `[topic] prompts for [tool]` → "UI design prompts for Midjourney" → TOOL IS SPECIFIED
- Just `[topic]` → "iOS design mockups" → TOOL NOT SPECIFIED, that's OK
- "best [topic]" or "top [topic]" → QUERY_TYPE = RECOMMENDATIONS
- "what are the best [topic]" → QUERY_TYPE = RECOMMENDATIONS

**IMPORTANT: Do NOT ask about target tool before research.**

- If tool is specified in the query, use it
- If tool is NOT specified, run research first, then ask AFTER showing results

**Store these variables:**

- `TOPIC = [extracted topic]`
- `TARGET_TOOL = [extracted tool, or "unknown" if not specified]`
- `QUERY_TYPE = [RECOMMENDATIONS | NEWS | HOW-TO | GENERAL]`

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 36 MINUTES 01 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE