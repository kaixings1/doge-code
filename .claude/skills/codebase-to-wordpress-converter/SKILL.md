---
name: TML/Next.js）转换
description: "将任何代码库（React/HTML/Next.js）转换为像素级完美的 WordPress 主题/插件的专家技能。"
risk: safe
source: community
date_added: "2026-04-12"
author: WHOISABHISHEKADHIKARI
---

# 代码库到 WordPress 转换器

## 概述

This skill is designed for the high-fidelity conversion of static or React-based frontends into fully functional, CMS-driven WordPress themes. It acts as a **Senior WordPress Architect**, **React Expert**, and **QA Engineer** to ensure a 100% pixel-perfect match while integrating deep WordPress functionality like ACF, dynamic menus, and technical SEO preservation.

## 何时使用 This Skill

- Use when converting a React (CRA/Vite/Next.js) or HTML project into a WordPress theme.
- Use when the client demands a 100% pixel-perfect match with the original source.
- Use when auditing an existing WordPress conversion for structural or SEO flaws.
- Use when you need to ensure technical SEO (架构, Meta tags, Heading hierarchy) is preserved exactly.

## 核心能力

### Phased Conversion & Audit
The skill follows a strict 4-phase forensic process:
1.  **Phase 1: Forensic UI Comparison**: Side-by-side table audit of React components vs. WordPress templates to find discrepancies.
2.  **Phase 2: Full Audit**: Deep dive into UI, SEO, CMS Editability, Navigation, Functionality, and 性能.
3.  **Phase 3: Action Plan**: Tasks classified as **SAFE**, **RISKY**, or **BLOCKED** to prevent breaking the UI.
4.  **Phase 4: Iterative Fixing**: Executing one safe task at a time with validation after each step.

### Absolute UI Lock
Strict enforcement of non-negotiable rules:
- No alterations to layout, spacing, typography, or colors.
- Exact preservation of Tailwind or CSS class names.
- Zero changes to DOM structure or HTML nesting.

## Step-by-Step Guide

### 1. Discovery & Forensic Audit
Start by identifying all components in the source code. Create a UI Comparison table comparing the original source output against the target WordPress output.
- *Rule: No fixes are allowed during this phase; only detection.*

### 2. Strategic Field Mapping
Map static React/HTML content to dynamic WordPress functions:
- Replace static text with `the_title()`, `get_field()`, or `the_content()`.
- Replace static paths with `get_template_directory_uri()`.

### 3. Implementation of Core Hooks
Ensure every theme includes the foundational WordPress hooks correctly:
- **Layout Files (`header.php` / `footer.php`)**: Must include `wp_head()` before `</head>` and `wp_footer()` before `</body>`.
- **Page Templates**: Must call `get_header()` and `get_footer()`.
- `register_nav_menus()` for dynamic navigation without breaking original HTML structure.

### 4. Validation & Live Tracker
Maintain a live tracker of Total Issues, Fixed, and Remaining. Every fix must be followed by a confirmation:
- ✅ No UI change
- ✅ No DOM change
- ✅ No class change

## 示例

### Example 1: Navigation Conversion
```php
// WRONG: Static replacement that adds wrappers
wp_nav_menu(['theme_location' => 'primary']);

// CORRECT: Preserving original Tailwind classes and structure
wp_nav_menu([
    'theme_location' => 'primary',
    'container' => false,
    'items_wrap' => '<ul class="flex space-x-8">%3$s</ul>',
    'walker' => new Custom_Tailwind_Walker()
]);
```

### Example 2: Asset Pathing
```php
// Source: <img src="/images/logo.png" />
// WP Conversion:
<img src="<?php echo get_template_directory_uri(); ?>/assets/images/logo.png" alt="Logo" />
```

## 最佳实践

- ✅ **Do:** Use `get_page_by_path()` for robust internal linking.
- ✅ **Do:** Implement ACF (Advanced Custom Fields) fallbacks in `functions.php`.
- ✅ **Do:** Keep the Tailwind 配置 in the `header.php` to ensure global styles are active.
- ❌ **Don't:** Add "div" wrappers or rename classes to "clean up" the code.
- ❌ **Don't:** Use standard WordPress default styles if they conflict with the original design.

## 其他资源

- [ACF Documentation](https://www.advancedcustomfields.com/resources/)
- [Tailwind CSS in WordPress](https://tailwindcss.com/docs/installation)
- [WordPress Theme Handbook](https://developer.wordpress.org/themes/)

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
