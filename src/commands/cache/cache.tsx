import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone) => {
  onDone(`## 缓存管理

缓存功能开发中，敬请期待。

### 当前缓存状态
- 会话缓存: 正常
- 模型响应缓存: 正常
`)
}
