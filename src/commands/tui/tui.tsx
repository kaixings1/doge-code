import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  onDone('TUI 模式功能开发中，敬请期待。')
  return React.createElement('div', null,
    React.createElement('h2', null, 'TUI 模式'),
    React.createElement('p', null, '功能开发中，敬请期待。')
  )
}
