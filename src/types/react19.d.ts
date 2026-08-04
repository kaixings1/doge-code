// React 19 运行时已支持 use/useEffectEvent，但 @types/react 停留在 18.x。
// 此文件为模块文件（通过 import 'react' + export {} 触发 module augmentation），
// 补充缺失的 React 19 类型，消除编译产物中的 TS2305 错误。
// 注意：不能放在无 import/export 的 ambient script 文件中，否则 declare module
// 会替换（而非增强）整个 'react' 模块类型。
import 'react'

declare module 'react' {
  export function use<T>(usable: Promise<T> | T): T
  export function useEffectEvent<T extends (...args: never[]) => unknown>(callback: T): T
}

export {}
