// grep-to-grep-tool helpers for BashTool

/**
 * 检测命令是否为简单的 grep/rg 搜索命令（不含管道、重定向等复杂结构）。
 */
export function isGrepSearchCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!/^\s*(grep|rg)\b/.test(trimmed)) return false;
  if (/[|&;`$(){}]/.test(trimmed)) return false;
  if (/\s*&\s*$/.test(trimmed)) return false;
  return true;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * 将 grep/rg 命令行参数解析为 GrepTool 的输入格式。
 * 返回 null 表示无法解析（回退到 shell 执行）。
 */
export function parseGrepToGrepToolArgs(command: string): Record<string, unknown> | null {
  const trimmed = command.trim();
  let rest = trimmed.replace(/^\s*(grep|rg)\s+/, '');
  const input: Record<string, unknown> = {};
  let pattern: string | null = null;
  let path: string | undefined;
  let glob: string | undefined;
  let caseInsensitive = false;
  let multiline = false;
  let head_limit: number | undefined;
  let context_before: number | undefined;
  let context_after: number | undefined;
  let context: number | undefined;
  let type_filter: string | undefined;
  let output_mode: 'content' | 'files_with_matches' | 'count' = 'files_with_matches';

  const tokens = tokenizeCommandGrep(rest);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '-e' && i + 1 < tokens.length) {
      if (!pattern) pattern = stripQuotes(tokens[++i]);
      else return null;
      continue;
    }
    if (token === '-i') { caseInsensitive = true; i++; continue; }
    if (token === '-l') { output_mode = 'files_with_matches'; i++; continue; }
    if (token === '-c') { output_mode = 'count'; i++; continue; }
    if (token === '-r' || token === '-R') { i++; continue; }
    if (token === '-F' || token === '-E' || token === '-G') { return null; }
    if (token === '-U' || token === '--multiline-dotall') { multiline = true; i++; continue; }
    if (/^-C\d+$/.test(token)) { context = parseInt(token.slice(2)); i++; continue; }
    if (token === '-C' && i + 1 < tokens.length) { context = parseInt(tokens[++i]); if (Number.isNaN(context)) return null; continue; }
    if (/^-B\d+$/.test(token)) { context_before = parseInt(token.slice(2)); i++; continue; }
    if (token === '-B' && i + 1 < tokens.length) { context_before = parseInt(tokens[++i]); if (Number.isNaN(context_before)) return null; continue; }
    if (/^-A\d+$/.test(token)) { context_after = parseInt(token.slice(2)); i++; continue; }
    if (token === '-A' && i + 1 < tokens.length) { context_after = parseInt(tokens[++i]); if (Number.isNaN(context_after)) return null; continue; }
    if (token === '--glob' && i + 1 < tokens.length) { glob = stripQuotes(tokens[++i]); continue; }
    if (token === '--type' && i + 1 < tokens.length) { type_filter = stripQuotes(tokens[++i]); continue; }
    if (token === '--max-columns' && i + 1 < tokens.length) { i += 2; continue; }
    if (/^--max-columns=\d+$/.test(token)) { i++; continue; }
    if (token === '--hidden') { i++; continue; }
    if (token === '--max-count' && i + 1 < tokens.length) { head_limit = parseInt(tokens[++i]); if (Number.isNaN(head_limit)) return null; continue; }
    if (token.startsWith('--')) return null;
    if (/^\-[a-zA-Z]$/.test(token)) return null;
    if (!pattern) {
      if (token.includes('/') || /^[a-zA-Z]:[\\/]/.test(token)) {
        path = stripQuotes(token);
      } else {
        pattern = stripQuotes(token);
      }
    } else if (!path && (token.includes('/') || /^[a-zA-Z]:[\\/]/.test(token))) {
      path = stripQuotes(token);
    } else {
      return null;
    }
    i++;
  }
  if (!pattern) return null;
  if (path) {
    path = path.replace(/\\/g, '/').replace(/^([a-zA-Z]):\//, '/$1/');
  }
  input.pattern = pattern;
  if (path) input.path = path;
  if (glob) input.glob = glob;
  if (type_filter) input.type = type_filter;
  if (caseInsensitive) input['-i'] = true;
  if (multiline) input.multiline = true;
  if (head_limit !== undefined) input.head_limit = head_limit;
  if (context !== undefined) input.context = context;
  if (context_before !== undefined) input['-B'] = context_before;
  if (context_after !== undefined) input['-A'] = context_after;
  input.output_mode = output_mode;
  return input;
}

function tokenizeCommandGrep(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inQuote) {
      if (ch === quoteChar) {
        current += ch;
        tokens.push(current);
        current = '';
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
