---
description: 为提供的角色绘图/照片添加真实动作捕捉动画（Meta AnimatedDrawings）→ 生成该绘图移动的光栅 GIF/MP4。如需从零创建矢量涂鸦，请使用 /ink-art。
argument-hint: [path to drawing] [motion: dance|walk|jump|wave]
---

Read `skills/creative/animated-drawing.md`, then set up and run Meta's open-source **AnimatedDrawings** to animate the supplied drawing with the requested motion.

- Use this only when the user *has* a humanoid drawing/photo to animate. To create a vector doodle from scratch that draws itself → use `/ink-art` instead.
- Output is **raster** (the original drawing warped) — no vector, no draw-on reveal. Confirm the input is a single humanoid on a plain light background.
- Prefer the turnkey bundled-character path first; the auto-rig path needs Docker + ~670 MB models.

Drawing + motion: $ARGUMENTS
