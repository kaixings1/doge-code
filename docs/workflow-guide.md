# Doge Code 工作流系统

## 概述

工作流系统允许您定义和执行重复性任务。工作流脚本存储在 `.doge/workflows/` 目录中。

## 目录结构

```
.doge/workflows/
├── demo/
│   └── workflow.json
├── code-review/
│   └── workflow.json
└── custom/
    └── workflow.json
```

## 工作流格式

### 目录工作流 (推荐)

创建一个目录，然后在其中创建 `workflow.json`:

```json
{
  "name": "工作流名称",
  "description": "工作流描述",
  "steps": [
    {
      "name": "步骤名称",
      "description": "步骤描述",
      "prompt": "要执行的提示内容"
    }
  ]
}
```

### 文件工作流

直接创建一个 `.json`、`.ts` 或 `.js` 文件：

```json
{
  "name": "simple",
  "description": "简单工作流",
  "steps": [
    { "prompt": "第一步内容" },
    { "prompt": "第二步内容" }
  ]
}
```

## 使用方法

### 列出所有工作流
```
/workflow
```

### 执行指定工作流
```
/workflow <名称>
```

### 创建新工作流
```
/workflow <新工作流名称>
```

## 步骤配置

每个步骤可以包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 步骤名称 |
| description | string | 步骤描述 |
| prompt | string | 执行此步骤的提示 |
| command | string | 可选：要执行的shell命令 |

## 示例：并行代码审查

```json
{
  "name": "code-review",
  "description": "并行代码审查",
  "steps": [
    {
      "name": "analyze",
      "description": "分析变更",
      "prompt": "分析代码变更，识别关键文件"
    },
    {
      "name": "review",
      "description": "审查",
      "prompt": "审查代码，检查 bug 和优化机会"
    }
  ]
}
```

## 高级用法

### 环境变量

工作流可以读取以下环境变量：
- `GITHUB_TOKEN` - GitHub API token
- `OPENAI_API_KEY` - OpenAI API key
- 项目根目录下的 `.env` 文件

### 并行执行

多个步骤可以并行执行。配置示例：

```json
{
  "name": "parallel-task",
  "steps": [
    {
      "name": "task1",
      "description": "任务1",
      "prompt": "执行任务1"
    },
    {
      "name": "task2", 
      "description": "任务2",
      "prompt": "执行任务2"
    }
  ]
}
```

## 参见

- [CLAUDE.md](../CLAUDE.md) - 项目开发指南
