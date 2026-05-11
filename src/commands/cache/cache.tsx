import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  onDone('缓存功能开发中，敬请期待。')
  return React.createElement('div', null,
    React.createElement('h2', null, '缓存管理'),
    React.createElement('p', null, '缓存功能开发中，敬请期待。'),
    React.createElement('h3', null, '当前缓存状态'),
    React.createElement('ul', null,
      React.createElement('li', null, '会话缓存: 正常'),
      React.createElement('li', null, '模型响应缓存: 正常')
    )
  )
}
