---
name: video-download
description: "Video Download — Video Download 相关功能和最佳实践"
  Download videos from Instagram, YouTube, TikTok, Twitter/X, Facebook, and
  1000+ other platforms as MP4 files using yt-dlp. Auto-recovers from YouTube
  bot detection ("Sign in to confirm you're not a bot", LOGIN_REQUIRED) by
  rotating through browser cookies and cookie files without manual
  intervention. Use this skill when the user wants to download, save, or grab
  one or more videos from any social media or video platform URL. Supports
  single videos or full playlists, configurable resolution, and saving to a
  specified target folder.
---

# Video Download Skill

Wraps yt-dlp with automatic recovery for YouTube anti-bot challenges.

## Tool

`scripts/download.py` — installs yt-dlp on first run, merges video+audio to MP4,
auto-rotates strategies on bot detection, uses a download-archive for safe resume.

## Workflow

1. Collect all URLs from the user's request.
2. Determine output directory (current working directory if unspecified).
3. Decide single-video vs playlist mode:
   - User says "this video" / single URL → leave default (single-video).
   - User says "playlist" / "all videos" / passes a `playlist?list=` URL → add `--playlist`.
4. Run the script. If YouTube bot detection hits, the script auto-rotates strategies.
5. Report which files were saved and which strategy worked.

## Usage

```bash
# Single video, current directory
python scripts/download.py "https://www.youtube.com/watch?v=..."

# Multiple URLs to a folder
python scripts/download.py "URL1" "URL2" -o "/path/to/output"

# Full playlist as 720p MP4
python scripts/download.py "https://www.youtube.com/playlist?list=..." --playlist -o "./out"

# Force a specific browser for cookies (skips auto-rotation)
python scripts/download.py "URL" --cookies-from-browser chrome

# Force a manual cookies.txt file
python scripts/download.py "URL" --cookies "~/Downloads/www.youtube.com_cookies.txt"

# Higher quality
python scripts/download.py "URL" --max-height 1080
```

## Flags

| Flag | Default | Notes |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 23 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE