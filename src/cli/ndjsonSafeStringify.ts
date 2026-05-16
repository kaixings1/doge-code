import { jsonStringify } from '../utils/slowOperations.js'

// JSON.stringify 发出 U+2028/U+2029 原始值（符合 ECMA-404）。当
// 输出是单个 NDJSON 行时，任何使用 JavaScript
// 行终止符语义（ECMA-262 §11.3 — \n \r U+2028 U+2029）的接收者
// 会将流分割，将 JSON 从中切断。ProcessTransport 现在
// 静默跳过非 JSON 行而不是崩溃（gh-28405），但
// 截断的部分仍然丢失 — 消息被静默丢弃。
//
// \uXXXX 形式是等价的 JSON（解析为相同的字符串）但
// 永远不会被任何接收者误认为是行终止符。这是
// ES2019 的"Subsume JSON"提议和 Node 的 util.inspect 所做的。
//
// 使用交替的单个正则表达式：回调的每个匹配的一次调度
// 比两次全字符串扫描更便宜。
const JS_LINE_TERMINATORS = /\u2028|\u2029/g

function escapeJsLineTerminators(json: string): string {
  return json.replace(JS_LINE_TERMINATORS, c =>
    c === '\u2028' ? '\\u2028' : '\\u2029',
  )
}

/**
 * 用于每行一个消息的传输层的 JSON.stringify。转义 U+2028
 * 行分隔符和 U+2029 段落分隔符，使序列化输出
 * 不会被按行分割的接收者破坏。输出仍然是有效的
 * JSON，并解析为相同的值。
 */
export function ndjsonSafeStringify(value: unknown): string {
  return escapeJsLineTerminators(jsonStringify(value))
}
