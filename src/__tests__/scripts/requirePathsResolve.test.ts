import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 守卫：源码里 require('...js') / require('...ts') 的相对路径必须可解析。
 *
 * 背景（2026-10-01）：ExitPlanModePermissionRequest.tsx:43 用
 *   require('../../utils/permissions/autoModeState.js')
 * 从 src/components/permissions/ExitPlanModePermissionRequest/ 出发
 * 会解析到 src/components/utils/permissions/ —— 该目录不存在。
 * 正确层级是 ../../../ （同文件第 46-47 行即如此）。
 *
 * 危害：启用 TRANSCRIPT_CLASSIFIER 时该 require 分支激活，
 * bun build 静态分析直接失败，无法完成打包。
 *
 * 更麻烦的是：这个修复做过两次都被后续编辑静默覆盖丢失
 * （与 settings.ts 缺失 readFileSync 导入同类）。本测试把「路径
 * 必须可解析」变成可断言的契约，任何覆盖都会立刻失败。
 */
const root = path.resolve(__dirname, '../../..');

function allSourceFiles(): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push(p);
      }
    }
  })(path.join(root, 'src'));
  return out;
}

/** .js / .ts / .tsx / 目录 index 均视为可解析 */
function resolves(spec: string, fromDir: string): boolean {
  const base = path.resolve(fromDir, spec);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.ts$/, '.tsx'),
    path.join(base.replace(/\.(js|ts)$/, ''), 'index.ts'),
    path.join(base.replace(/\.(js|ts)$/, ''), 'index.tsx'),
  ];
  return candidates.some(c => fs.existsSync(c));
}

describe('require / import 相对路径可解析', () => {
  const files = allSourceFiles();

  it('扫描到足够的源码文件', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('所有带扩展名的相对 require/import 都能解析到真实文件', () => {
    const bad: string[] = [];
    let checked = 0;

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const dir = path.dirname(f);
      const re = /(?:require\(\s*|from\s+)['"](\.[^'"]+\.(?:js|ts|tsx))['"]/g;
      for (const m of src.matchAll(re)) {
        // 跳过 "...js" 这类省略号字面量（正则示例/文档，非真实引用）
        if (m[1].startsWith('...')) continue;
        checked++;
        if (!resolves(m[1], dir)) {
          bad.push(
            `${path.relative(root, f).replace(/\\/g, '/')} -> ${m[1]}`,
          );
        }
      }
    }

    expect(checked).toBeGreaterThan(1000);
    if (bad.length) {
      throw new Error(
        `发现 ${bad.length} 处无法解析的相对引用:\n  ${bad.join('\n  ')}`,
      );
    }
  });

  it('ExitPlanModePermissionRequest 的 autoModeState 引用层级正确', () => {
    const f = path.join(
      root,
      'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    );
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/['"](\.\.[\/.]*utils\/permissions\/autoModeState\.\w+)['"]/);
    expect(m).not.toBeNull();

    const spec = m![1];
    // 必须是三级向上（../../../），两级会解析到不存在的 src/components/utils/
    expect(spec.startsWith('../../../')).toBe(true);
    expect(
      resolves(spec, path.dirname(f)),
    ).toBe(true);
  });
});
