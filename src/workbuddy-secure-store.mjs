/**
 * 加密存储工具（AES-256-GCM）
 *
 * 吸收自 workbuddy_to_api-main 的 crypto.py（AESGCM）与 storage.py 的加密落地逻辑。
 * 用 Node 原生 crypto 实现，零依赖。默认 12 字节随机 nonce + 16 字节认证标签，
 * 密文布局与 to_api 一致：ciphertext + tag（解密时拆最后 16 字节）。
 *
 * 设计：本仓库账户体系（workbuddy-account-store.mjs）默认沿用明文 accounts.json，
 * 这是本地单用户代理，明文已实用。本模块作为「可选增强」——通过环境变量
 * WORKBUDDY_ENCRYPT=1 启用后，账号文件落地为加密的 accounts.enc.json（密钥存
 * 于 data/master.key，权限 0600）。两种模式并存，不破坏既有明文行为。
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from './workbuddy-paths.mjs';

const ALGO = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ASSOCIATED = Buffer.from('workbuddy-proxy-v1');

/** 生成或读取 32 字节 master key（十六进制字符串持久化）。 */
export function ensureMasterKey(dataDir = resolveDataDir()) {
  const keyFile = join(dataDir, 'master.key');
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, 'utf8').trim();
    const key = Buffer.from(hex, 'hex');
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  try { chmodSync(keyFile, 0o600); } catch { /* Windows 忽略 */ }
  return key;
}

/** 加密 JSON 可序列化对象 → 返回 { iv, tag, data } 的 base64 包。 */
export function encryptJson(value, key) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(ASSOCIATED);
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: nonce.toString('base64'),
    tag: tag.toString('base64'),
    data: Buffer.concat([ciphertext, tag]).toString('base64'),
  };
}

/** 解密 encryptJson 产出的包 → 还原 JS 对象。校验失败时抛错（防篡改）。 */
export function decryptJson(pkg, key) {
  try {
    const nonce = Buffer.from(pkg.iv, 'base64');
    const blob = Buffer.from(pkg.data, 'base64');
    if (blob.length < TAG_BYTES) throw new Error('密文过短');
    const ciphertext = blob.subarray(0, blob.length - TAG_BYTES);
    const tag = blob.subarray(blob.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGO, key, nonce);
    decipher.setAAD(ASSOCIATED);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(json.toString('utf8'));
  } catch (error) {
    throw new Error(`解密失败（密钥不符或数据损坏）: ${error.message}`);
  }
}

/** 加密落地：把对象加密后写入 filePath（先临时文件再覆盖，降低半截文件风险）。 */
export function saveEncrypted(filePath, value, key) {
  const pkg = encryptJson(value, key);
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(pkg, null, 2), { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* Windows 忽略 */ }
  writeFileSync(filePath, JSON.stringify(pkg, null, 2), { mode: 0o600 });
  try { writeFileSync(filePath, JSON.stringify(pkg, null, 2)); } catch { /* 已写 */ }
  try { require('node:fs').unlinkSync(tmp); } catch { /* 清理失败忽略 */ }
  return pkg;
}

/** 解密读取：返回还原对象；文件不存在返回 fallback。 */
export function loadEncrypted(filePath, key, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try {
    const pkg = JSON.parse(readFileSync(filePath, 'utf8'));
    return decryptJson(pkg, key);
  } catch (error) {
    throw new Error(`读取加密文件失败: ${error.message}`);
  }
}

/**
 * 为前端展示生成掩码 API 密钥。
 * 吸收自 claude-code-nexus 的 utils/encryption.ts:maskApiKey —— 用于 Web 控制台
 * 安全展示账户密钥（仅保留首尾若干字符）。
 *
 * @param {string} apiKey 完整密钥
 * @returns {string} 掩码后字符串
 */
export function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length <= 8) {
    return '*'.repeat(apiKey ? apiKey.length : 8);
  }
  const start = apiKey.substring(0, 4);
  const end = apiKey.substring(apiKey.length - 4);
  const middle = '*'.repeat(Math.max(4, apiKey.length - 8));
  return `${start}${middle}${end}`;
}

export { ALGO, NONCE_BYTES, TAG_BYTES };
