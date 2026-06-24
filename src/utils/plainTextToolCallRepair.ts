/**
 * Plain Text Tool Call Repair
 *
 * Some models (especially via OAI-compatible bridges) emit tool calls as
 * plain text in their response rather than structured tool_use blocks.
 * This module detects and repairs those patterns.
 *
 * Supported formats:
 *   1. [tool_name]{json} + optional [/tool_name] or [END_TOOL_REQUEST]
 *   2. <function=tool_name> + <parameter=name>value</parameter> + </function>
 *   3. <channel>analysis to=tool_name code{json}<call> (Harmony format)
 *
 * Design inspired by OpenClaw's tool-call-repair package.
 */

const END_TOOL_REQ = '[END_TOOL_REQUEST]'
const H_CHANNEL = '<|channel|>'
const H_MSG = '<|message|>'
const H_CALL = '<|call|>'
const MAX_PAYLOAD = 256_000

function isTN(c: string) { return /[A-Za-z0-9_-]/.test(c) }

function ws(t: string, s: number, f: (c: string) => boolean) {
  let i = s; while (i < t.length && f(t[i])) i++; return i
}

const skipWS = (t: string, s: number) => ws(t, s, c => /\s/.test(c))
const skipHWS = (t: string, s: number) => ws(t, s, c => c === ' ' || c === '\t')

function lb(t: string, s: number): number | null {
  if (t[s] === '\r') return t[s + 1] === '\n' ? s + 2 : s + 1
  if (t[s] === '\n') return s + 1
  return null
}

/** Find end of balanced JSON object */
function fj(t: string, s: number): number | null {
  let d = 0, q = false, e = false
  for (let i = s; i < t.length; i++) {
    if (i - s > MAX_PAYLOAD) return null
    const c = t[i]
    if (q) {
      if (e) { e = false; continue }
      if (c === '\\') { e = true; continue }
      if (c === '"') { q = false; continue }
      continue
    }
    if (c === '"') { q = true; continue }
    if (c === '{') { d++; continue }
    if (c === '}') { d--; if (d === 0) return i + 1 }
  }
  return null
}

/** Parse JSON object starting at s */
function pj(t: string, s: number): { e: number; v: Record<string, unknown> } | null {
  const c = skipWS(t, s)
  if (t[c] !== '{') return null
  const e = fj(t, c); if (!e) return null
  try {
    const p = JSON.parse(t.slice(c, e))
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    return { e, v: p as Record<string, unknown> }
  } catch { return null }
}

/** Parse [tool_name] opening */
function pb(t: string, s: number): { e: number; n: string; cl: boolean } | null {
  if (t[s] !== '[') return null; let c = s + 1
  if (t.startsWith('tool:', c)) {
    c += 5; const ns = c; while (isTN(t[c])) c++
    if (c === ns || t[c] !== ']') return null
    return { e: c + 1, n: t.slice(ns, c), cl: false }
  }
  const ns = c; while (isTN(t[c])) c++
  if (c === ns || t[c] !== ']') return null
  const n = t.slice(ns, c); c++
  c = skipHWS(t, c); const lbr = lb(t, c)
  return lbr === null ? null : { e: lbr, n, cl: true }
}

/** Parse Harmony opening */
function ph(t: string, s: number): { e: number; n: string } | null {
  let c = s
  if (t.startsWith(H_CHANNEL, c)) c += H_CHANNEL.length
  const cs = c; while (/[A-Za-z_]/.test(t[c] ?? '')) c++
  const ch = t.slice(cs, c)
  if (ch !== 'commentary' && ch !== 'analysis' && ch !== 'final') return null
  c = skipHWS(t, c); if (!t.startsWith('to=', c)) return null; c += 3
  const ns = c; while (isTN(t[c])) c++
  if (c === ns) return null; const n = t.slice(ns, c)
  c = skipHWS(t, c); if (!t.startsWith('code', c)) return null; c += 4
  c = skipWS(t, c)
  if (t.startsWith(H_MSG, c)) c = skipWS(t, c + H_MSG.length)
  return { e: c, n }
}

/** Parse any opening */
function po(t: string, s: number): { e: number; n: string; cl: boolean } | null {
  const b = pb(t, s); if (b) return b
  const h = ph(t, s); if (h) return { e: h.e, n: h.n, cl: false }
  return null
}

/** Parse closing marker */
function pc(t: string, s: number, n: string): number | null {
  const c = skipWS(t, s)
  if (t.startsWith(END_TOOL_REQ, c)) return c + END_TOOL_REQ.length
  if (t.startsWith('[/' + n + ']', c)) return c + n.length + 3
  return null
}

/** Parse optional Harmony closing */
function hc(t: string, s: number): number {
  const c = skipWS(t, s)
  return t.startsWith(H_CALL, c) ? c + H_CALL.length : s
}

/** Plain text tool call block type */
export type PlainTextToolCallBlock = {
  arguments: Record<string, unknown>
  end: number
  name: string
  raw: string
  start: number
}

/** Parse a single JSON-style block */
function pb2(t: string, s: number, a?: Set<string>): PlainTextToolCallBlock | null {
  const o = po(t, s); if (!o) return null
  if (a && !a.has(o.n)) return null
  const j = pj(t, o.e); if (!j) return null
  const ce = o.cl ? pc(t, j.e, o.n) : hc(t, j.e)
  if (ce === null) return null
  return {
    arguments: j.v, end: ce, name: o.n,
    raw: t.slice(s, ce), start: s,
  }
}

/** Parse <parameter=name>value</parameter> */
function xp(t: string, s: number): { e: number; n: string; v: string } | null {
  const c = skipWS(t, s)
  const m = /^<parameter=([A-Za-z0-9_.:-]{1,120})>/i.exec(t.slice(c))
  if (!m || !m[1]) return null
  const ps = c + m[0].length
  const cm = /<\/parameter>/i.exec(t.slice(ps))
  if (!cm) return null
  const cs = ps + cm.index; const ce = cs + cm[0].length
  if (ce - c > MAX_PAYLOAD) return null
  let vs = ps, ve = cs
  const lbr = lb(t, vs)
  if (lbr !== null) {
    vs = lbr
    if (ve > vs && t[ve - 1] === '\n') ve--
    if (ve > vs && t[ve - 1] === '\r') ve--
  }
  return { e: ce, n: m[1], v: t.slice(vs, ve) }
}

/** Parse XML-ish function block */
function xb2(t: string, s: number, a?: Set<string>): PlainTextToolCallBlock | null {
  const o = pb(t, s) || (() => {
    const m = /^<function=([A-Za-z0-9_.:-]{1,120})>\s*/i.exec(t.slice(s))
    return m && m[1] ? { e: s + m[0].length, n: m[1], cl: false } : null
  })()
  if (!o) return null
  if (a && !a.has(o.n)) return null
  const args: Record<string, unknown> = {}
  let c = o.e, pc2 = 0
  while (true) {
    const p = xp(t, c); if (!p) break
    if (p.e - o.e > MAX_PAYLOAD) return null
    args[p.n] = p.v; pc2++; c = p.e
  }
  if (pc2 === 0) return null
  const end = skipWS(t, c)
  const fe = t.slice(end).toLowerCase().startsWith('</function>')
    ? end + '</function>'.length : end
  return {
    arguments: args, end: fe, name: o.n,
    raw: t.slice(s, fe), start: s,
  }
}

/**
 * Parse all standalone plain-text tool call blocks from text.
 * Returns null if text is not entirely composed of tool calls.
 */
export function parsePlainTextToolCalls(
  text: string,
  allowedNames?: string[],
): PlainTextToolCallBlock[] | null {
  const blocks: PlainTextToolCallBlock[] = []
  const as = allowedNames ? new Set(allowedNames) : void 0
  let c = skipWS(text, 0)
  while (c < text.length) {
    const b = pb2(text, c, as) || xb2(text, c, as)
    if (!b) return null
    blocks.push(b)
    c = skipWS(text, b.end)
  }
  return blocks.length > 0 ? blocks : null
}

/**
 * Strip plain-text tool call blocks from text, leaving only user-visible text.
 */
export function stripPlainTextToolCalls(text: string): string {
  if (!text || !(/\[(?:tool:)?[A-Za-z0-9_-]+\]/.test(text)
    || /<\|channel\|>/.test(text) || /<function=/.test(text))) {
    return text
  }
  let result = '', cursor = 0, idx = 0
  while (idx < text.length) {
    if (idx !== 0 && text[idx - 1] !== '\n') { idx++; continue }
    const bs = skipHWS(text, idx)
    const b = pb2(text, bs)
    const be = b ? b.end : (xb2(text, bs) ? xb2(text, bs)!.end : null)
    if (be === null) { idx++; continue }
    result += text.slice(cursor, idx); cursor = be
    const lbr = lb(text, cursor); if (lbr !== null) cursor = lbr
    idx = cursor
  }
  result += text.slice(cursor)
  return result
}

/**
 * Check if text contains plain-text tool calls that should be repaired.
 */
export function containsPlainTextToolCalls(text: string): boolean {
  return text ? parsePlainTextToolCalls(text) !== null : false
}
