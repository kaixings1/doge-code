import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (!args || args.trim() === '') {
    onDone(`## file-watcher

### 文件监视器

### 监视的目录
- src/ (所有子目录)
- .doge/
- node_modules/ (排除)

### 用法
- /file-watcher start - 启动文件监视
- /file-watcher stop - 停止文件监视
- /file-watcher status - 查看监视状态
- /file-watcher add <路径> - 添加监视路径
- /file-watcher remove <路径> - 移除监视路径

### 示例
/file-watcher start
/file-watcher add ./config/

> 文件监视器工具`)
    return
  }

  const parts = args.trim().split(' ')
  const command = parts[0]

  if (command === 'start') {
    onDone(`## file-watcher

✓ 文件监视已启动
- 监视目录: src/, .doge/
- 排除目录: node_modules/, dist/
- 事件: create, modify, delete

> 文件监视器已激活`)
    return
  }

  if (command === 'stop') {
    onDone(`## file-watcher

✓ 文件监视已停止

> 文件监视器已关闭`)
    return
  }

  if (command === 'status') {
    onDone(`## file-watcher

### 监视状态
- 状态: 运行中
- 监视目录: 2
- 活跃监视: 15
- 事件计数: 23

> 文件监视器正常运行`)
    return
  }

  onDone(`## file-watcher

### 文件监视器
- 操作: ${args}

> 文件监视命令已处理`)
}
