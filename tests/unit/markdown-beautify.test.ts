import { describe, it, expect, vi } from 'vitest';

// mock 掉 color 模块（真实 color.ts 会拉入 theme→env→终端检测 依赖链，
// 在 node/vitest 下无法解析）。beautifyInlineText 只依赖 color 的
// (key) => (text) => ansi 契约，mock 用固定 ANSI 码即可验证着色逻辑。
vi.mock('../../src/components/design-system/color.js', () => ({
  color: (key: string) => (text: string) => {
    if (key === 'success') return `\x1b[32m${text}\x1b[39m`;
    if (key === 'warning') return `\x1b[33m${text}\x1b[39m`;
    return `\x1b[31m${text}\x1b[39m`; // error → 红
  },
}));

import { beautifyInlineText } from '../../src/utils/inlineBeautify.js';
import stripAnsi from '../../src/vendor/stripAnsi.js';

const theme = 'dark';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[39m';

describe('markdown 正文美化（中文label冒号 / 确认询问词 / 强调词）', () => {
  it('中文词语（2-6字）+ 冒号 → 绿色（success）', () => {
    const out = beautifyInlineText('摘要：这是内容', theme);
    expect(out).toContain(`${GREEN}摘要：${RESET}`);
    expect(stripAnsi(out)).toBe('摘要：这是内容');
  });

  it('半角冒号同样标绿', () => {
    const out = beautifyInlineText('步骤: 安装依赖', theme);
    expect(out).toContain(`${GREEN}步骤:${RESET}`);
    expect(stripAnsi(out)).toBe('步骤: 安装依赖');
  });

  it('label 前是标点时也标绿（前缀保留无色）', () => {
    const out = beautifyInlineText('、摘要：内容', theme);
    expect(out).toContain(`、${GREEN}摘要：${RESET}`);
    expect(stripAnsi(out)).toBe('、摘要：内容');
  });

  it('超过 6 字且无独立词语的句子不被标成 label', () => {
    const out = beautifyInlineText('这是一个很长的测试语句：内容', theme);
    expect(out).not.toContain(GREEN);
    expect(stripAnsi(out)).toBe('这是一个很长的测试语句：内容');
  });

  it('"继续/需要/是否" 等确认询问词 → 琥珀色（warning）', () => {
    const out = beautifyInlineText('是否继续？', theme);
    expect(out).toContain(`${AMBER}是否继续${RESET}`);
    expect(stripAnsi(out)).toBe('是否继续？');
  });

  it('扩充的询问词（请问/可不可以/没问题）→ 琥珀色', () => {
    const out = beautifyInlineText('请问可不可以继续？没问题吧', theme);
    expect(out).toContain(`${AMBER}请问${RESET}`);
    expect(out).toContain(`${AMBER}可不可以${RESET}`);
    expect(out).toContain(`${AMBER}没问题吧${RESET}`);
    expect(stripAnsi(out)).toBe('请问可不可以继续？没问题吧');
  });

  it('强调词（注意/警告/务必）→ 红色（error）', () => {
    const out = beautifyInlineText('注意安全，危险操作务必小心', theme);
    expect(out).toContain(`${RED}注意${RESET}`);
    expect(out).toContain(`${RED}危险${RESET}`);
    expect(out).toContain(`${RED}务必${RESET}`);
    expect(out).toContain(`${RED}小心${RESET}`);
    expect(stripAnsi(out)).toBe('注意安全，危险操作务必小心');
  });

  it('label 优先于确认词/强调词，不嵌套着色', () => {
    const out = beautifyInlineText('注意：方案一', theme);
    // "注意：" 前面是行首 → label 匹配，整体绿色（而非"注意"红色）
    expect(out).toContain(`${GREEN}注意：${RESET}`);
    expect(out).not.toContain(RED);
    expect(out).not.toContain(AMBER);
    expect(stripAnsi(out)).toBe('注意：方案一');
  });

  it('普通英文/数字文本不加色', () => {
    expect(beautifyInlineText('Hello world', theme)).toBe('Hello world');
    expect(beautifyInlineText('Version 1.2.3', theme)).toBe('Version 1.2.3');
  });

  it('着色的纯文本与原文本一致（不影响宽度计算）', () => {
    const out = beautifyInlineText('如果继续学习，需要先配置环境', theme);
    expect(stripAnsi(out)).toBe('如果继续学习，需要先配置环境');
    expect(out).toContain(`${AMBER}继续${RESET}`);
    expect(out).toContain(`${AMBER}需要${RESET}`);
  });
});
