---
description: 显示巴基斯坦标准时间（PKT, UTC+5）的当前时间
---

# Time Command

Display the current date and time in Pakistan Standard Time (PKT, UTC+5).

## Instructions

1. Run the following bash command to get the current time in PKT:
   ```
   TZ='Asia/Karachi' date '+%Y-%m-%d %H:%M:%S %Z'
   ```

2. Display the result to the user in this format:
   ```
   Current Time in Pakistan (PKT): YYYY-MM-DD HH:MM:SS PKT
   ```

## Requirements

- Always use the `Asia/Karachi` timezone (UTC+5)
- Use 24-hour format
- Include the date alongside the time
- Keep the output concise
