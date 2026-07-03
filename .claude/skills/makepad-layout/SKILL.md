---
name: makepad-layout
description: "Makepad Layout — Makepad Layout 相关功能和最佳实践"
  CRITICAL: Use for Makepad layout system. Triggers on:
  makepad layout, makepad width, makepad height, makepad flex,
  makepad padding, makepad margin, makepad flow, makepad align,
  Fit, Fill, Size, Walk, "how to center in makepad",
  makepad 布局, makepad 宽度, makepad 对齐, makepad 居中
risk: safe
source: community
---

# Makepad Layout Skill

> **Version:** makepad-widgets (dev branch) | **Last Updated:** 2026-01-19
>
> Check for updates: https://crates.io/crates/makepad-widgets

You are an expert at Makepad layout system. Help users by:
- **Writing code**: Generate layout code following the patterns below
- **Answering questions**: Explain layout concepts, sizing, flow directions

## When to Use
- You need to size, align, or position widgets in a Makepad UI.
- The task involves `Walk`, `Align`, `Fit`, `Fill`, padding, spacing, or container flow configuration.
- You want Makepad-specific layout solutions for centering, responsiveness, or composition.

## Documentation

Refer to the local files for detailed documentation:
- `./references/layout-system.md` - Complete layout reference
- `./references/core-types.md` - Walk, Align, Margin, Padding types

## IMPORTANT: Documentation Completeness Check

**Before answering questions, Claude MUST:**

1. Read the relevant reference file(s) listed above
2. If file read fails or file is empty:
   - Inform user: "本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - Still answer based on SKILL.md patterns + built-in knowledge
3. If reference file exists, incorporate its content into the answer

## Key Patterns

### 1. Basic Layout Container

```rust
<View> {
    width: Fill
    height: Fill
    flow: Down
    padding: 16.0
    spacing: 8.0

    <Label> { text: "Item 1" }
    <Label> { text: "Item 2" }
}
```

### 2. Centering Content

```rust
<View> {
    width: Fill
    height: Fill
    align: { x: 0.5, y: 0.5 }

    <Label> { text: "Centered" }
}
```

### 3. Horizontal Row Layout

```rust
<View> {
    width: Fill
    height: Fit
    flow: Right
    spacing: 10.0
    align: { y: 0.5 }  // Vertically center items

    <Button> { text: "Left" }
    <View> { width: Fill }  // Spacer
    <Button> { text: "Right" }
}
```

### 4. Fixed + Flexible Layout

```rust
<View> {
    width: Fill
    height: Fill
    flow: Down

    // Fixed header
    <View> {
        width: Fill
        height: 60.0
    }

    // Flexible content
    <View> {
        width: Fill
        height: Fill  // Takes remaining space
    }
}
```

## Layout Properties Reference

| Property | Type | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 18 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE