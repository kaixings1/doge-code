declare const MACRO: {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  VERSION_CHANGELOG: string
  ISSUES_EXPLAINER: string
  FEEDBACK_CHANNEL: string
}

/**
 * Bun 的 text loader 会把 .md 等文本文件作为字符串内联。
 * bundled skill 通过 `import x from './x.md'` 读取文档内容。
 */
declare module '*.md' {
  const content: string
  export default content
}
