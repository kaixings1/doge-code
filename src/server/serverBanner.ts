import type { ServerConfig } from './types.js'

function maskToken(token?: string): string {
  if (!token) return '(none)'
  if (token.length <= 8) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * 打印服务器启动横幅：地址、PID、认证 token（脱敏）、workspace、版本。
 */
export function printBanner(config: ServerConfig, authToken?: any, port?: any): void {
  const host = config.host || '127.0.0.1'
  const actualPort = port ?? config.port
  const httpUrl = config.unix
    ? `unix:${config.unix}`
    : `http://${host}:${actualPort}`
  const token = authToken ?? config.authToken

  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    '║              Doge Code Session Server                    ║',
    '╠══════════════════════════════════════════════════════════╣',
    `║  URL:        ${httpUrl.padEnd(48)}║`,
    `║  PID:        ${String(process.pid).padEnd(48)}║`,
    `║  Auth Token: ${maskToken(token).padEnd(48)}║`,
    `║  Workspace:  ${(config.workspace || process.cwd()).padEnd(48)}║`,
    `║  Version:    ${(MACRO.VERSION || 'dev').padEnd(48)}║`,
    '╚══════════════════════════════════════════════════════════╝',
    '',
  ]
  process.stdout.write(lines.join('\n') + '\n')
}
