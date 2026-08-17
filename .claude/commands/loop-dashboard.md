---
description: 打开 Loop V2 Web 监控面板（浏览器可视化）
argument-hint: "[--port PORT] [--checkpoints PATH] [--metrics PATH]"
---

# Loop Dashboard

打开 Loop V2 Web 监控面板，可视化展示循环状态、指标、死信队列。

## Usage

`/loop-dashboard [options]`

### Options

- `--port PORT` — 监控面板端口（默认 3711）
- `--checkpoints PATH` — 检查点目录路径
- `--metrics PATH` — 指标文件路径
- `--open` — 自动打开浏览器

## What It Shows

### 1. Active Loops（活跃循环）
- Loop ID、Pattern、Status
- Current iteration / max iterations
- 进度条
- Token 消耗实时图表

### 2. Loop History（历史记录）
- 最近 20 条循环记录
- 成功/失败状态
- 执行时间趋势图

### 3. Dead Letter Queue（死信队列）
- 失败任务列表
- 错误类型分布
- 重试次数统计

### 4. Metrics Dashboard（指标面板）
- 总执行次数
- 成功率趋势
- Token 消耗趋势
- 成本估算

### 5. System Health（系统健康）
- CPU / 内存使用率
- 磁盘空间（检查点目录）
- 锁状态

## Examples

```bash
# 启动监控面板（默认端口 3711）
/loop-dashboard

# 指定端口
/loop-dashboard --port 8080

# 自动打开浏览器
/loop-dashboard --open

# 自定义数据路径
/loop-dashboard --checkpoints ~/.doge/loops/checkpoints --metrics ~/.doge/loops/metrics.json
```

## Implementation

The dashboard is a simple HTML/JS page served by the local HTTP server:

```
GET http://localhost:3711/loop-dashboard
```

It reads:
- `~/.doge/loops/checkpoints/*.json` — 检查点数据
- `~/.doge/loops/metrics.json` — 指标数据
- `~/.doge/loops/dead-letter-queue/*.json` — 死信队列

And renders:
- Real-time charts (Chart.js)
- Progress bars
- Status indicators
- Filterable tables

## Tech Stack

- Frontend: Vanilla HTML/CSS/JS (no build step)
- Charts: Chart.js (CDN)
- Data: JSON files (no database)
- Server: Existing HTTP server (port 3710/3711)

## Files

- `src/server/loop-dashboard.ts` — 路由处理
- `public/loop-dashboard.html` — 前端页面
- `public/loop-dashboard.js` — 数据获取和渲染逻辑
