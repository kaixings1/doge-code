import { describe, it, expect, vi } from 'vitest';
import chalk from 'chalk';

// 测试环境非 TTY，chalk 默认禁色；设置 level=1 启用基础 ANSI（bold 等）。
// 这模拟真实终端，验证表格表头加粗。
(chalk as any).level = 1;

// mock color 模块（避免拉入 theme→env→终端检测 依赖链）。
// 只区分 suggestion（蓝）与其他（无色），验证表格表头加粗与列表序号着色。
vi.mock('../../src/components/design-system/color.js', () => ({
  color: (key: string) => (text: string) => {
    if (key === 'suggestion') return `\x1b[34m${text}\x1b[39m`;
    return text;
  },
}));

import { applyMarkdown } from '../../src/utils/markdown.js';
import stripAnsi from '../../src/vendor/stripAnsi.js';

const theme = 'dark';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m'; // chalk 关闭粗体用 22（非 39）
const RESET = '\x1b[39m';

describe('markdown 渲染美化（表格表头 / 列表序号）', () => {
  it('表格表头加粗', () => {
    const out = applyMarkdown(
      '| 名称 | 状态 |\n| --- | --- |\n| 编译 | 通过 |',
      theme,
    );
    // 表头单元格被 bold 包裹
    expect(out).toContain(`${BOLD}名称${BOLD_OFF}`);
    expect(out).toContain(`${BOLD}状态${BOLD_OFF}`);
    // 数据行不加粗
    expect(stripAnsi(out)).toContain('| 编译 | 通过 |');
  });

  it('无序列表序号（-）→ 蓝色', () => {
    const out = applyMarkdown('- 第一项\n- 第二项', theme);
    expect(out).toContain(`${BLUE}-${RESET}`);
    expect(stripAnsi(out)).toContain('- 第一项');
  });

  it('有序列表序号（1. 2.）→ 蓝色', () => {
    const out = applyMarkdown('1. 第一步\n2. 第二步', theme);
    expect(out).toContain(`${BLUE}1.${RESET}`);
    expect(out).toContain(`${BLUE}2.${RESET}`);
    expect(stripAnsi(out)).toContain('1. 第一步');
  });
});
