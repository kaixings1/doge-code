---
name: video-download
description: "Video Download — Video Download 相关功能和最佳实践"
  Download videos from Instagram, YouTube, TikTok, Twitter/X, Facebook, and
  1000+ other platforms as MP4 files using yt-dlp. Auto-recovers from YouTube
  bot detection ("Sign in to confirm you're not a bot", LOGIN_REQUIRED) by
  rotating through browser cookies and cookie files without manual
  intervention. 使用此技能当 the user wants to download, save, or grab
  one or more videos from any social media or video platform URL. Supports
  single videos or full playlists, configurable resolution, and saving to a
  specified target folder.
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