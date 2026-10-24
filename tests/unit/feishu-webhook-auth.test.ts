/**
 * 飞书回调鉴权回归测试。
 *
 * 背景（真实缺陷）：webhook 保存了 appSecret 却从未校验回调来源。
 * 公网暴露的 9901 端口等于「任何人可向本机会话注入指令」。
 * 现支持两种机制：
 *   1. Verification Token —— header.token 比对
 *   2. Encrypt Key —— AES-256-CBC 密文回调解密
 *
 * 变异验证：把 verifyWebhookToken 改成恒返回 true，用例 2 失败；
 * 把 decryptFeishuPayload 的 key 由 SHA256 改成原文，用例 4 失败。
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decryptFeishuPayload,
  verifyWebhookToken,
} from '../../src/services/feishu/feishuWebhook.js'

/** 按飞书规范加密：AES-256-CBC，key = SHA256(encryptKey)，前 16 字节为 IV。 */
function feishuEncrypt(plain: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, body]).toString('base64')
}

describe('飞书回调 Verification Token', () => {
  it('未配置 token 时不校验（保持向后兼容）', () => {
    expect(verifyWebhookToken('anything', undefined)).toBe(true)
    expect(verifyWebhookToken(undefined, '')).toBe(true)
  })

  it('配置后必须匹配', () => {
    expect(verifyWebhookToken('abc123', 'abc123')).toBe(true)
    expect(verifyWebhookToken('abc124', 'abc123')).toBe(false)
    expect(verifyWebhookToken('abc1234', 'abc123')).toBe(false)
  })

  it('配置后缺少 token 拒绝', () => {
    expect(verifyWebhookToken(undefined, 'abc123')).toBe(false)
  })
})

describe('飞书加密回调解密', () => {
  it('能还原飞书下发的密文', () => {
    const payload = JSON.stringify({ header: { event_type: 'im.message.receive_v1' }, event: {} })
    const encrypted = feishuEncrypt(payload, 'my-encrypt-key')
    expect(decryptFeishuPayload(encrypted, 'my-encrypt-key')).toBe(payload)
  })

  it('密钥错误时解密失败而不是返回垃圾', () => {
    const encrypted = feishuEncrypt('{"a":1}', 'right-key')
    expect(() => decryptFeishuPayload(encrypted, 'wrong-key')).toThrow()
  })

  it('密文被篡改时抛错（CBC 填充校验）', () => {
    const encrypted = feishuEncrypt('{"a":1}', 'k')
    const raw = Buffer.from(encrypted, 'base64')
    raw[raw.length - 1] ^= 0xff
    expect(() => decryptFeishuPayload(raw.toString('base64'), 'k')).toThrow()
  })
})
