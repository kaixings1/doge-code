import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## 会话分析报告

正在分析你的 Claude Code 会话模式...

### 分析内容

1. **使用模式**
   - 最常用的命令
   - 平均会话长度
   - 工具使用频率

2. **效率指标**
   - 命令完成率
   - 权限拒绝次数
   - 重试操作次数

3. **建议**
   - 自定义命令推荐
   - 设置优化建议
   - 插件推荐

分析完成后，报告将显示在此处。`, { display: 'system' })
}
