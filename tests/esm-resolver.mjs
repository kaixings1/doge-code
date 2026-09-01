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
    const tsSpecifier = specifier.replace(/\.js$/, '.ts');
    // 优先尝试 .ts 文件（让 vitest alias 能拦截 src/commands.ts 等模块）
    try {
      return await nextResolve(tsSpecifier, context);
    } catch {
      // .ts 不存在时回退到 .js
      try {
        return await nextResolve(specifier, context);
      } catch {
        let candidate = specifier;
        if (specifier.startsWith('file:')) {
          candidate = fileURLToPath(specifier);
        } else if (specifier.startsWith('.')) {
          const base = context.parentURL ? fileURLToPath(new URL(specifier, context.parentURL)) : specifier;
          candidate = base.replace(/\.js$/, '.ts');
        }
        if (candidate !== specifier && existsSync(candidate)) {
          return nextResolve(new URL(candidate, context.parentURL).href, context);
        }
        throw new Error(
          `[esm-resolver] Cannot resolve import('${specifier}')：找不到 .ts 或 .js 文件`,
        );
      }
    }
  }
  return nextResolve(specifier, context);
}
