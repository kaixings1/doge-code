/**
 * Node ESM resolve hook：
 * 让通过 Node ESM（type stripping）加载的 .ts 模块内部的
 * `.js` 后缀 import 回退到 `.ts` 文件（模拟 bun 的隐式解析）。
 *
 * 与 tests/setup.ts 中的 require patch 配合，覆盖两条模块加载路径：
 * - require()  → Module._resolveFilename patch
 * - import     → 本 hook
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  // 仅处理文件路径形式的 .js 导入
  if (
    specifier.endsWith('.js') &&
    (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:'))
  ) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      const tsSpecifier = specifier.replace(/\.js$/, '.ts');
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        // .ts 也不存在时检查文件系统中的实际文件
        let candidate = specifier;
        if (specifier.startsWith('file:')) {
          candidate = fileURLToPath(specifier);
        } else if (!specifier.startsWith('.')) {
          candidate = specifier;
        } else {
          const base = context.parentURL ? fileURLToPath(new URL(specifier, context.parentURL)) : specifier;
          const tsCandidate = base.replace(/\.js$/, '.ts');
          if (existsSync(tsCandidate)) {
            return nextResolve(new URL(tsCandidate, context.parentURL).href, context);
          }
        }
        if (candidate !== specifier && existsSync(candidate.replace(/\.js$/, '.ts'))) {
          return nextResolve(candidate.replace(/\.js$/, '.ts'), context);
        }
        throw new Error(
          `[esm-resolver] Cannot resolve import('${specifier}')：找不到 .js 或 .ts 文件`,
        );
      }
    }
  }
  return nextResolve(specifier, context);
}
