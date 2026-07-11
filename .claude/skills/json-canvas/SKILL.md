---
name: 创建和编辑 JSON Canvas 文件（.canvas）
description: 创建和编辑 JSON Canvas 文件（.canvas）：创建节点、边、分组和连接，用于思维导图与流程梳理。
risk: safe
source: "https://github.com/kepano/obsidian-skills"
date_added: "2026-03-21"
---
# JSON Canvas 技能

## 何时使用

- 创建或编辑 .canvas 文件
- 用于思维导图、流程图、视觉笔记结构

## 文件结构

画布文件为 JSON，包含 `nodes` 和 `edges` 两个顶级数组。

## 节点

| 属性 | 必填 | 类型 | 描述 |
|---|---|---|---|
| id | 是 | string | 唯一标识 |
| type | 是 | string | 节点类型 |
| x | 是 | number | 横坐标 |
| y | 是 | number | 纵坐标 |
| width | 是 | number | 宽度 |
| height | 是 | number | 高度 |
| text | 交互时使用| string | 显示文本 |

## 常见工作流

### 1. 创建新画布

```bash
jq -n '{nodes: [], edges: []}' > new-canvas.canvas
```

### 2. 向现有画布添加节点

```bash
# 追加节点
jq '.nodes += [{"id":"node1","type":"text","x":100,"y":100,"width":300,"height":80,"text":"新节点"}]' canvas.canvas > updated.canvas
```

### 3. 连接两个节点

```bash
# 追加边
jq '.edges += [{"id":"edge1","fromNode":"node1","fromSide":"right","toNode":"node2","toSide":"left"}]' canvas.canvas > updated.canvas
```

### 4. 打开编辑

```bash
# 使用支持 .canvas 的编辑器打开
# 或直接修改 JSON 后重启应用
```

## 限制

- 仅适用于支持该格式的应用（如 Obsidian）
- 坐标系为正整数像素
