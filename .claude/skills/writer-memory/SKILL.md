---
name: writer-memory
description: 面向写作者的智能记忆系统——追踪角色、关系、场景和主题
argument-hint: "init|char|rel|scene|query|validate|synopsis|status|export [args]"
level: 7
---

# Writer Memory - Agentic Memory System for Writers

Persistent memory system designed for creative writers, with first-class support for Korean storytelling workflows.

## Overview

Writer Memory maintains context across Claude sessions for fiction writers. It tracks:

- **Characters (캐릭터)**: Emotional arcs (감정궤도), attitudes (태도), dialogue tone (대사톤), speech levels
- **World (세계관)**: Settings, rules, atmosphere, constraints
- **Relationships (관계)**: Character dynamics and evolution over time
- **Scenes (장면)**: Cut composition (컷구성), narration tone, emotional tags
- **Themes (테마)**: Emotional themes (정서테마), authorial intent

All data persists in `.writer-memory/memory.json` for git-friendly collaboration.

## Commands

| Command | Action |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 35 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE