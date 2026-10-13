/**
 * workbuddy-paths — 数据目录解析
 *
 * 所有持久化文件（config.json / auth.json / accounts.json / desensitize.json /
 * logs.jsonl / debug/）统一放在项目根目录下的 data/，随源码整体拷贝即可搬走，
 * 不再写入用户主目录。
 *
 * 优先级：显式 directory 参数 > WORKBUDDY_PROXY_HOME 环境变量 > <项目根>/data
 * （测试通过 WORKBUDDY_PROXY_HOME 指向临时目录，仍走隔离路径）
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** 项目根目录（本文件位于 <root>/src/ 下） */
export const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 默认数据目录：<项目根>/data */
export const DEFAULT_DATA_DIR = join(PROJECT_ROOT, 'data');

/** 解析数据目录：显式参数 > 环境变量 > 默认 <项目根>/data */
export function resolveDataDir(directory) {
  if (directory) return directory;
  const fromEnv = (process.env.WORKBUDDY_PROXY_HOME || '').trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_DATA_DIR;
}
