import { execSync, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## shell

### Shell命令执行

### 用法
- /shell <命令> - 执行shell命令
- /shell pwd - 显示当前目录
- /shell ls - 列出文件
- /shell cd <目录> - 切换目录
- /shell echo <消息> - 输出消息

### 示例
/shell ls -la
/shell pwd
/shell echo "Hello World"

> Shell命令执行工具`
  }

  try {
    const { stdout, stderr } = await execAsync(args, { 
      cwd: process.cwd(),
      timeout: 30000 // 30 second timeout
    })
    
    const output = stdout || stderr || '(无输出)'
    
    return `## shell

### 命令执行结果

\`\`\`
${output}
\`\`\`

> 命令执行成功`
  } catch (error: any) {
    const errorMessage = error.stderr || error.message || '未知错误'
    
    return `## shell

### 命令执行失败

\`\`\`
${errorMessage}
\`\`\`

> 命令执行出错`
  }
}
