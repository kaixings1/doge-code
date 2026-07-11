---
name: 无障碍审计
description: "扫描前端项目中 WCAG 2.2 无障碍违规并修复。用法: /a11y-audit [路径]"
argument-hint: "[path]"
---

# /a11y-audit

扫描前端项目中的 WCAG 2.2 无障碍问题，展示修复方案，并可选择检查颜色对比度。

## 用法

```bash
/a11y-audit                     # 扫描当前项目
/a11y-audit ./src               # 扫描指定目录
/a11y-audit ./src --fix         # 扫描并自动修复可修复项
```

## 功能说明

### 步骤 1：扫描

在目标目录上运行无障碍扫描器：

```bash
python3 {skill_path}/scripts/a11y_scanner.py {path} --json
```

解析 JSON 输出。按严重程度分组（严重 → 较重 → 中等 → 轻微）。

显示摘要：
```
无障碍审计：./src
  严重: 3 | 较重: 7 | 中等: 12 | 轻微: 5
  已扫描文件: 42 | 存在问题的文件: 15
```

### 步骤 2：修复

针对每个发现（从严重开始）：

1. 读取受影响的文件
2. 展示违规内容及上下文（修复前）
3. 从 `engineering-team/a11y-audit/skills/a11y-audit/references/framework-a11y-patterns.md` 应用修复
4. 展示结果（修复后）

**可自动修复的问题**（无需询问直接应用）：
- 装饰性图片缺少 `alt=""`
- `<html>` 缺少 `lang` 属性
- `tabindex` 值 > 0 → 设置为 0
- 非提交按钮缺少 `type="button"`
- 移除 outline 但未替换 → 添加 `:focus-visible` 样式

**需要用户输入的问题**（展示修复方案，询问是否应用）：
- 缺少 alt 文本（需要用户提供描述）
- 缺少表单标签（需要标签文本）
- 标题结构调整（可能影响布局）
- ARIA 角色变更（可能影响功能）

### 步骤 3：对比度检查

如果存在 CSS 文件，运行对比度检查器：

```bash
python3 {skill_path}/scripts/contrast_checker.py --batch {path}
```

针对每个失败的色彩组合，建议可访问的替代方案。

### 步骤 4：报告

在 `a11y-report.md` 生成 Markdown 报告：
- 执行摘要（通过/失败、问题数量）
- 每个文件的发现及前后差异
- 剩余需要人工审查的项目
- WCAG 标准覆盖情况

## 技能参考

- `engineering-team/a11y-audit/skills/a11y-audit/SKILL.md`
- `engineering-team/a11y-audit/skills/a11y-audit/scripts/a11y_scanner.py`
- `engineering-team/a11y-audit/skills/a11y-audit/scripts/contrast_checker.py`
- `engineering-team/a11y-audit/skills/a11y-audit/references/wcag-quick-ref.md`
- `engineering-team/a11y-audit/skills/a11y-audit/references/aria-patterns.md`
- `engineering-team/a11y-audit/skills/a11y-audit/references/framework-a11y-patterns.md`
