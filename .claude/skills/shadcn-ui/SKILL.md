---
name: 使用 shadcn/ui 构建 UI 组件。与 Stitch 设计循环
description: "Shadcn UI — 使用 shadcn/ui 构建 UI 组件。与 Stitch 设计循环配合，快速交付结构化、可访问的组件。"
triggers:
  - "shadcn"
  - "shadcn ui"
  - "shadcn components"
  - "accessible components"
od:
  mode: design-system
  category: design-systems
  upstream: "https://github.com/google-labs-code/skills"
---

# shadcn/ui 组件构建

> 源自 Google Labs (Stitch)。

## 功能描述

使用 shadcn/ui 构建 UI 组件。与 Stitch 设计循环配合，快速交付结构化、可访问的组件。

## 来源

- 上游仓库：https://github.com/google-labs-code/skills
- 类别：`design-systems`

## 使用方法

此目录条目在 Open Design 中宣传该技能，以便代理在规划期间发现它。要运行完整的上游工作流及其原始资源、脚本和参考文档，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 检查上游 README 获取确切路径
open https://github.com/google-labs-code/skills
```

然后让代理按名称（`shadcn-ui`）或使用此技能 frontmatter 中列出的触发短语来调用此技能。

## shadcn/ui 概述

### 核心特性
- 基于 Tailwind CSS 的组件库
- 完全可访问的组件
- 类型安全的 TypeScript 实现
- 高度可定制的设计系统

### 设计原则
- 可组合的组件架构
- 一致的设计令牌
- 语义化的 HTML 结构
- 完善的键盘导航支持

## 组件类型

### 基础组件
- 按钮（Button）
- 输入框（Input）
- 选择器（Select）
- 复选框（Checkbox）
- 单选框（Radio）

### 布局组件
- 卡片（Card）
- 对话框（Dialog）
- 抽屉（Drawer）
- 弹出框（Popover）
- 工具提示（Tooltip）

### 数据展示
- 表格（Table）
- 数据列表（Data Table）
- 日历（Calendar）
- 图表（Charts）

### 导航组件
- 导航栏（Navigation Bar）
- 侧边栏（Sidebar）
- 标签页（Tabs）
- 面包屑（Breadcrumb）

## 集成工作流

### Stitch 设计循环
1. **设计**：在 Figma 中创建设计
2. **生成**：使用 Stitch 生成代码
3. **实现**：用 shadcn/ui 组件实现
4. **测试**：验证可访问性和功能
5. **迭代**：基于反馈优化

### 开发流程
```bash
# 初始化项目
npx shadcn-ui init

# 添加组件
npx shadcn-ui add button
npx shadcn-ui add dialog
npx shadcn-ui add table

# 自定义主题
npx shadcn-ui theme
```

## 最佳实践

### 组件使用
- 保持组件单一职责
- 使用组合而非继承
- 实现适当的错误状态
- 提供完整的键盘支持

### 可访问性
- 语义化的 HTML 标签
- 适当的 ARIA 属性
- 焦点管理
- 屏幕阅读器支持

### 性能优化
- 代码分割
- 懒加载组件
- 虚拟滚动
- 记忆化渲染

## 定制化

### 主题配置
```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
      },
    },
  },
}
```

### 组件变体
```typescript
// button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

## 工具和资源

### 开发工具
- VS Code 扩展
- Figma 插件
- 组件浏览器
- 主题生成器

### 测试工具
- 可访问性测试
- 视觉回归测试
- 组件测试框架
- 性能分析工具

### 文档资源
- 官方文档
- 组件示例
- API 参考
- 最佳实践指南

## 常见问题

### 安装问题
- 依赖版本冲突
- 构建配置错误
- 类型定义缺失
- 样式冲突

### 使用问题
- 组件定制困难
- 主题覆盖问题
- 性能问题
- 可访问性问题

### 集成问题
- 与其他库冲突
- 构建工具集成
- 测试框架集成
- 部署问题

## 社区和支持

### 学习资源
- 官方教程
- 视频课程
- 社区示例
- 案例研究

### 支持渠道
- GitHub Issues
- 社区论坛
- Discord 频道
- 文档反馈

### 贡献指南
- 代码贡献
- 文档改进
- 问题报告
- 功能建议
