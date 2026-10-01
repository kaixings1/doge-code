import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * d.bat（bun run 直跑）和 compile.bat（bun build 打包）各维护一份
 * feature gate 清单。两边一旦漂移，直跑模式与 doge.exe 产物的功能
 * 行为就会不一致，且极难排查（feature() 是编译期折叠，运行时无感）。
 *
 * 本测试锁定两者必须完全一致。
 *
 * 背景：2026-10-01 修复时 d.bat 只有 1 个 gate（TERMINAL_PANEL），
 * 而 compile.bat 有 56 个 —— 走 bun run 时其余 55 个功能实际处于关闭
 * 状态（settings.json 的 env 设了值也没用，feature() 不读 env）。
 */
const root = path.resolve(__dirname, '../../..');
const dbat = path.join(root, 'd.bat');
const cbat = path.join(root, 'compile.bat');

function readFeats(file: string, sep: '=' | ' '): string[] {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, 'utf8');
  const re = sep === '='
    ? /--feature=([A-Z_]+)/g
    : /--feature\s+([A-Z_]+)/g;
  // 只取实际命令行：跳过 REM 注释（注释里会出现 "--feature X" 这类说明文字）
  const lines = src.split(/\r?\n/).filter(l => !/^\s*REM/i.test(l.trim()));
  return lines.flatMap(l => [...l.matchAll(re)].map(m => m[1]));
}

/**
 * compile.bat 打包时有意排除的 gate。
 *
 * WORKFLOW_SCRIPTS 的 require() 会拉入 ink/build/reconciler.js（含
 * top-level await），bun build 静态分析阶段报 "require call is not
 * allowed"，必须靠 --external ink 规避。compile.bat 选择直接不开这个
 * gate（见其第 44-45 行注释），而 bun run 直跑无此限制，故 d.bat 保留。
 */
const COMPILE_EXCLUDED = ['WORKFLOW_SCRIPTS'] as const;

describe('feature gate 清单一致性', () => {
  it('compile.bat 的 gate 加上有意排除项后，与 d.bat 完全一致', () => {
    const d = [...new Set(readFeats(dbat, '='))].sort();
    const c = [...new Set(readFeats(cbat, ' '))].sort();

    expect(d.length).toBeGreaterThan(0);
    expect(c.length).toBeGreaterThan(0);
    expect([...c, ...COMPILE_EXCLUDED].sort()).toEqual(d);
  });

  it('有意排除的 gate 必须在 compile.bat 注释中说明原因', () => {
    const src = fs.readFileSync(cbat, 'utf8');
    for (const name of COMPILE_EXCLUDED) {
      expect(src).toContain(name);
    }
    // 说明原因的注释（top-level await / ink）
    expect(src).toMatch(/top-level await/i);
  });

  it('两边均无重复 gate', () => {
    const d = readFeats(dbat, '=');
    const c = readFeats(cbat, ' ');
    expect(new Set(d).size).toBe(d.length);
    expect(new Set(c).size).toBe(c.length);
  });
});
