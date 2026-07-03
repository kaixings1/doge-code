---
name: makepad-dsl
description: "Makepad Dsl — Makepad Dsl 相关功能和最佳实践"
  CRITICAL: Use for Makepad DSL syntax and inheritance. Triggers on:
  makepad dsl, live_design, makepad inheritance, makepad prototype,
  "<Widget>", "Foo = { }", makepad object, makepad property,
  makepad DSL 语法, makepad 继承, makepad 原型, 如何定义 makepad 组件
risk: safe
source: community
---

# Makepad DSL Skill

> **Version:** makepad-widgets (dev branch) | **Last Updated:** 2026-01-19
>
> Check for updates: https://crates.io/crates/makepad-widgets

You are an expert at the Rust `makepad-widgets` crate DSL. Help users by:
- **Writing code**: Generate DSL code following the patterns below
- **Answering questions**: Explain DSL syntax, inheritance, property overriding

## When to Use
- You need help with Makepad `live_design!` syntax, object definitions, or inheritance patterns.
- The task involves widget declarations, property overrides, prototypes, or DSL composition rules.
- You want Makepad DSL-specific examples rather than generic Rust syntax advice.

## Documentation

Refer to the local files for detailed documentation:
- `./references/dsl-syntax.md` - Complete DSL syntax reference
- `./references/inheritance.md` - Inheritance patterns and examples

## IMPORTANT: Documentation Completeness Check

**Before answering questions, Claude MUST:**

1. Read the relevant reference file(s) listed above
2. If file read fails or file is empty:
   - Inform user: "本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - Still answer based on SKILL.md patterns + built-in knowledge
3. If reference file exists, incorporate its content into the answer

## Key Patterns

### 1. Anonymous Object

```rust
{
    width: 100.0
    height: 50.0
    color: #FF0000
}
```

### 2. Named Object (Prototype)

```rust
MyButton = {
    width: Fit
    height: 40.0
    padding: 10.0
    draw_bg: { color: #333333 }
}
```

### 3. Inheritance with Override

```rust
PrimaryButton = <MyButton> {
    draw_bg: { color: #0066CC }  // Override parent color
    draw_text: { color: #FFFFFF }  // Add new property
}
```

### 4. Widget Instantiation

```rust
<View> {
    // Inherits from View prototype
    width: Fill
    height: Fill

    <Button> { text: "Click Me" }  // Child widget
    <Label> { text: "Hello" }      // Another child
}
```

### 5. Linking Rust Struct to DSL

```rust
// In live_design!
MyWidget = {{MyWidget}} {
    // DSL properties
    width: 100.0
}

// In Rust
#[derive(Live, LiveHook, Widget)]
pub struct MyWidget {
    #[deref] view: View,
    #[live] width: f64,
}
```

## DSL Syntax Reference

| Syntax | Description | Example |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 21 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE