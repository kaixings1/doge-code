---
name: 视频下载
description: "视频下载 — 使用 yt-dlp 从 Instagram、YouTube、TikTok、Twitter/X、Facebook 和 1000+ 其他平台下载视频为 MP4 文件。通过自动轮换浏览器 cookies 自动恢复 YouTube 机器人检测。当用户想要从任何社交媒体或视频平台 URL 下载、保存或获取一个或多个视频时使用此技能。支持单个视频或完整播放列表、可配置分辨率和保存到指定目标文件夹。"
---

# 视频下载技能

封装 yt-dlp 并自动恢复以应对 YouTube 反机器人挑战。

## 工具

`scripts/download.py` — 首次运行时安装 yt-dlp，合并视频+音频为 MP4，
在检测到机器人验证时自动轮换策略，使用下载存档以安全恢复。

## 工作流程

1. 从用户请求中收集所有 URL。
2. 确定输出目录（如果未指定则为当前工作目录）。
3. 决定单视频 vs 播放列表模式：
   - 用户说"这个视频" / 单个 URL → 保留默认（单视频）。
   - 用户说"播放列表" / "所有视频" / 传递 `playlist?list=` URL → 添加 `--playlist`。
4. 运行脚本。如果触发 YouTube 机器人检测，脚本会自动轮换策略。
5. 报告哪些文件已保存以及哪种策略有效。

## 用法

```bash
# 单视频，当前目录
python scripts/download.py "https://www.youtube.com/watch?v=..."

# 多个 URL 到文件夹
python scripts/download.py "URL1" "URL2" -o "/path/to/output"

# 完整播放列表作为 720p MP4
python scripts/download.py "https://www.youtube.com/playlist?list=..." --playlist -o "./out"

# 强制使用特定浏览器获取 cookies（跳过自动轮换）
python scripts/download.py "URL" --cookies-from-browser chrome

# 强制使用手动 cookies.txt 文件
python scripts/download.py "URL" --cookies "~/Downloads/www.youtube.com_cookies.txt"

# 更高画质
python scripts/download.py "URL" --max-height 1080
```

## 标志

| 标志 | 默认值 | 说明 |