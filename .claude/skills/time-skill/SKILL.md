---
name: time-skill
description: 时间管理技能
user-invocable: true
---

# Time Skill

This skill displays the current date and time in Pakistan Standard Time (PKT).

## Task

Display the current date and time in Pakistan Standard Time (UTC+5).

## 使用说明

1. **Get Current Time**: Run the following bash command:
   ```
   TZ='Asia/Karachi' date '+%Y-%m-%d %H:%M:%S %Z'
   ```

2. **Display Result**: Show the time in this format:
   ```
   Current Time in Pakistan (PKT): YYYY-MM-DD HH:MM:SS PKT
   ```

## Requirements

- Always use the `Asia/Karachi` timezone (UTC+5)
- Use 24-hour format
- Include the date alongside the time
- Keep the output concise — no extra commentary
