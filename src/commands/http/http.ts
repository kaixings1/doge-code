import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone) => {
  onDone(`## http

功能开发中...
`)
}
