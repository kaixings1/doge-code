import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (!args || args.trim() === '') {
    onDone(`## monitor

### 系统监控

### 监控项目
- 系统资源 (CPU, 内存, 磁盘)
- 网络状态
- 进程状态
- 服务健康

### 用法
- /monitor status - 查看系统状态
- /monitor processes - 查看进程
- /monitor services - 查看服务
- /monitor network - 查看网络

### 示例
/monitor status
/monitor processes --sort cpu

> 系统监控工具`)
    return
  }

  const parts = args.trim().split(' ')
  const command = parts[0]

  if (command === 'status') {
    onDone(`## monitor

### 系统状态

- CPU使用率: 45%
- 内存使用率: 65% (8.2GB/12.8GB)
- 磁盘使用率: 72% (230GB/320GB)
- 网络: 正常
- 运行时间: 12天 5小时

> 系统运行正常`)
    return
  }

  if (command === 'processes') {
    onDone(`## monitor

### 进程列表

PID    CPU%   内存    名称
1234   15.2   512MB   node
5678   8.5    256MB   python
9012   3.2    128MB   bash

> 共 3 个活跃进程`)
    return
  }

  onDone(`## monitor

### 系统监控
- 操作: ${args}

> 系统监控命令已处理`)
}
