---
globs: gui/**/*
description: 确保 GUI 组件中使用系统默认浏览器打开 URL 的一致行为。
  IDE messenger pattern
alwaysApply: false
---

# GUI Link Opening

When adding functionality to open external links in GUI components, use `ideMessenger.post("openUrl", url)` where `ideMessenger` is obtained from `useContext(IdeMessengerContext)`
