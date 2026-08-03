/**
 * 深度不可变类型 — 将对象的所有属性递归转为只读。
 * 函数类型保持不变，数组转为 ReadonlyArray。
 */
export type DeepImmutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepImmutable<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
      : T

/** 排列类型（占位/工具类型） */
export type Permutations<T> = T
