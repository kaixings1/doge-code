import { describe, it, expect, vi } from 'vitest';
import chalk from 'chalk';

// inlineBeautify 用 chalk.bold 做警示 label 加粗；测试环境非 TTY，
// 默认禁色，设置 level=1 启用基础 ANSI。
(chalk as any).level = 1;

// mock 掉 color 模块（真实 color.ts 会拉入 theme→env→终端检测 依赖链，
// 在 node/vitest 下无法解析）。beautifyInlineText 只依赖 color 的
// (key) => (text) => ansi 契约，mock 用固定 ANSI 码即可验证着色逻辑。
vi.mock('../../src/components/design-system/color.js', () => ({
  color: (key: string) => (text: string) => {
    if (key === 'success') return `\x1b[32m${text}\x1b[39m`;
    if (key === 'warning') return `\x1b[33m${text}\x1b[39m`;
    if (key === 'error') return `\x1b[31m${text}\x1b[39m`;
    if (key === 'merged') return `\x1b[35m${text}\x1b[39m`; // 紫
    return `\x1b[34m${text}\x1b[39m`; // suggestion → 蓝
  },
}));

import { beautifyInlineText } from '../../src/utils/inlineBeautify.js';
import stripAnsi from '../../src/vendor/stripAnsi.js';

const theme = 'dark';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const PURPLE = '\x1b[35m';
const RESET = '\x1b[39m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m'; // chalk 关闭粗体用 22（非 39）

describe('markdown 正文美化（label / 确认词 / 强调词 / 数值）', () => {
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

  it('扩充的询问词（请问/可不可以/没问题/是不是/可否）→ 琥珀色', () => {
    const out = beautifyInlineText('请问是不是可以继续？可否确认一下', theme);
    expect(out).toContain(`${AMBER}请问${RESET}`);
    expect(out).toContain(`${AMBER}是不是${RESET}`);
    expect(out).toContain(`${AMBER}可否${RESET}`);
    expect(out).toContain(`${AMBER}确认一下${RESET}`);
    expect(stripAnsi(out)).toBe('请问是不是可以继续？可否确认一下');
  });

  it('强调词（注意/警告/务必）→ 红色（error）', () => {
    const out = beautifyInlineText('注意安全，危险操作务必小心', theme);
    expect(out).toContain(`${RED}注意${RESET}`);
    expect(out).toContain(`${RED}危险${RESET}`);
    expect(out).toContain(`${RED}务必${RESET}`);
    expect(out).toContain(`${RED}小心${RESET}`);
    expect(stripAnsi(out)).toBe('注意安全，危险操作务必小心');
  });

  it('百分比/时间数值（含"周"）→ 蓝色（suggestion）', () => {
    const out = beautifyInlineText('完成度 80%，预计耗时 10分钟，剩余 3天，还需 2周', theme);
    expect(out).toContain(`${BLUE}80%${RESET}`);
    expect(out).toContain(`${BLUE}10分钟${RESET}`);
    expect(out).toContain(`${BLUE}3天${RESET}`);
    expect(out).toContain(`${BLUE}2周${RESET}`);
    expect(stripAnsi(out)).toBe('完成度 80%，预计耗时 10分钟，剩余 3天，还需 2周');
  });

  it('英文 label（Summary:/Step 1:）→ 绿色', () => {
    const out = beautifyInlineText('Summary: 要点说明\nStep 1: 安装依赖', theme);
    expect(out).toContain(`${GREEN}Summary:${RESET}`);
    expect(out).toContain(`${GREEN}Step 1:${RESET}`);
    expect(stripAnsi(out)).toBe('Summary: 要点说明\nStep 1: 安装依赖');
  });

  it('英文 label 保守规则：URL/端口/单字母/时间不误标 label', () => {
    // https:// 协议冒号后是 //，不会误标 label；但整串 URL 由 URL 分支标蓝
    expect(beautifyInlineText('参见 https://example.com', theme)).toContain(
      `${BLUE}https://example.com${RESET}`,
    );
    // 端口 com:8080 冒号后是数字，不匹配 label，也不匹配 URL（无协议前缀）
    expect(beautifyInlineText('地址 example.com:8080', theme)).toBe(
      '地址 example.com:8080',
    );
    // 单字母 A: 对话前缀，不匹配
    expect(beautifyInlineText('A: 你好', theme)).toBe('A: 你好');
    // 时间 10:30 数字开头，不匹配
    expect(beautifyInlineText('在 10:30 完成', theme)).toBe('在 10:30 完成');
  });

  it('裸数字/版本号不标色', () => {
    expect(beautifyInlineText('Version 1.2.3', theme)).toBe('Version 1.2.3');
    expect(beautifyInlineText('共 42 个文件', theme)).toBe('共 42 个文件');
  });

  it('label 优先于确认词/强调词，不嵌套着色', () => {
    const out = beautifyInlineText('注意：方案一', theme);
    // "注意：" 前面是行首 → label 匹配，整体红色加粗（警示 label）
    // 而非 "注意" 被强调词红色 + "方案一" 拆开嵌套
    expect(out).toContain(`${BOLD}${RED}注意：${RESET}${BOLD_OFF}`);
    expect(out).not.toContain(GREEN);
    expect(out).not.toContain(AMBER);
    expect(stripAnsi(out)).toBe('注意：方案一');
  });

  it('普通英文文本不加色', () => {
    expect(beautifyInlineText('Hello world', theme)).toBe('Hello world');
  });

  it('着色的纯文本与原文本一致（不影响宽度计算）', () => {
    const out = beautifyInlineText('如果继续学习，需要先配置环境，耗时约 2小时', theme);
    expect(stripAnsi(out)).toBe('如果继续学习，需要先配置环境，耗时约 2小时');
    expect(out).toContain(`${AMBER}继续${RESET}`);
    expect(out).toContain(`${AMBER}需要${RESET}`);
    expect(out).toContain(`${BLUE}2小时${RESET}`);
  });

  it('URL（https://...）→ 蓝色', () => {
    const out = beautifyInlineText('参见 https://example.com/docs，然后继续', theme);
    expect(out).toContain(`${BLUE}https://example.com/docs${RESET}`);
    expect(out).toContain(`${AMBER}继续${RESET}`);
    expect(stripAnsi(out)).toBe('参见 https://example.com/docs，然后继续');
  });

  it('URL 尾部标点（，、。.）不吞进蓝色', () => {
    expect(beautifyInlineText('访问 https://example.com，继续', theme)).toContain(
      `${BLUE}https://example.com${RESET}，`,
    );
    expect(beautifyInlineText('详见 https://example.com. 文档', theme)).toContain(
      `${BLUE}https://example.com${RESET}.`,
    );
  });

  it('文件路径（含 / 或简单文件名）→ 紫色', () => {
    const out = beautifyInlineText('修改 src/utils/markdown.ts 与 package.json，再看 README.md', theme);
    expect(out).toContain(`${PURPLE}src/utils/markdown.ts${RESET}`);
    expect(out).toContain(`${PURPLE}package.json${RESET}`);
    expect(out).toContain(`${PURPLE}README.md${RESET}`);
    expect(stripAnsi(out)).toBe(
      '修改 src/utils/markdown.ts 与 package.json，再看 README.md',
    );
  });

  it('文件路径保守规则：Node.js/React.js/example.com/1.2.3/npm 不误标', () => {
    // 品牌名大小写混合，不匹配全小写/全大写分支，也不从词中间拆出子串
    expect(beautifyInlineText('使用 Node.js 和 React.js 框架', theme)).toBe(
      '使用 Node.js 和 React.js 框架',
    );
    // 域名 com 不在扩展名白名单；1.2.3 数字段不匹配；npm 无扩展名
    expect(beautifyInlineText('地址 example.com 和 1.2.3 版本，run npm', theme)).toBe(
      '地址 example.com 和 1.2.3 版本，run npm',
    );
  });

  it('URL 优先于文件路径：URL 内的路径段不标紫', () => {
    const out = beautifyInlineText('下载 https://cdn.com/app/index.ts 文件', theme);
    expect(out).toContain(`${BLUE}https://cdn.com/app/index.ts${RESET}`);
    expect(out).not.toContain(PURPLE);
    expect(stripAnsi(out)).toBe('下载 https://cdn.com/app/index.ts 文件');
  });

  it('URL 里的端口/冒号不误标 label，整串保持蓝色', () => {
    const out = beautifyInlineText('接口 http://api.example.com:8080/v1/health', theme);
    expect(out).toContain(`${BLUE}http://api.example.com:8080/v1/health${RESET}`);
    expect(out).not.toContain(GREEN); // "api.example.com:" 不应被当英文 label
    expect(stripAnsi(out)).toBe('接口 http://api.example.com:8080/v1/health');
  });

  it('日期（ISO 与中文年月日）→ 蓝色', () => {
    const out = beautifyInlineText('截止 2026-08-05 或 2026/08/05，即 2026年8月5日', theme);
    expect(out).toContain(`${BLUE}2026-08-05${RESET}`);
    expect(out).toContain(`${BLUE}2026/08/05${RESET}`);
    expect(out).toContain(`${BLUE}2026年8月5日${RESET}`);
    expect(stripAnsi(out)).toBe('截止 2026-08-05 或 2026/08/05，即 2026年8月5日');
  });

  it('日期保守规则：版本号 1.2.3、"2026 年"（带空格）不误标', () => {
    expect(beautifyInlineText('版本 1.2.3 与 2026 年发布', theme)).toBe(
      '版本 1.2.3 与 2026 年发布',
    );
  });

  it('箭头符号（→ => ->）→ 蓝色', () => {
    const out = beautifyInlineText('流程：编译 → 打包 → 部署，const x => x + 1，p->next', theme);
    expect(out).toContain(`${GREEN}流程：${RESET}`); // label 优先
    expect(out).toContain(`${BLUE}→${RESET}`);
    expect(out).toContain(`${BLUE}=>${RESET}`);
    expect(out).toContain(`${BLUE}->${RESET}`);
    expect(stripAnsi(out)).toBe('流程：编译 → 打包 → 部署，const x => x + 1，p->next');
  });

  it('负面结果词（中文）→ 红色', () => {
    const out = beautifyInlineText('构建失败，编译报错，检查错误信息', theme);
    expect(out).toContain(`${RED}失败${RESET}`);
    expect(out).toContain(`${RED}报错${RESET}`);
    expect(out).toContain(`${RED}错误${RESET}`);
    expect(stripAnsi(out)).toBe('构建失败，编译报错，检查错误信息');
  });

  it('负面结果词（英文 failed/error/bug）→ 红色，且 \b 防子串', () => {
    const out = beautifyInlineText('Execution failed with error, fixed a bug', theme);
    expect(out).toContain(`${RED}failed${RESET}`);
    expect(out).toContain(`${RED}error${RESET}`);
    expect(out).toContain(`${RED}bug${RESET}`);
    expect(stripAnsi(out)).toBe('Execution failed with error, fixed a bug');
    // terrorist 里的 error 子串不误标
    expect(beautifyInlineText('terrorist 是恐怖分子', theme)).toBe('terrorist 是恐怖分子');
  });

  it('负面词歧义控制：解决问题/问问题（中性）不标，"错误：" 走 label 绿', () => {
    expect(beautifyInlineText('解决问题，问问题都可以', theme)).toBe(
      '解决问题，问问题都可以',
    );
    const out = beautifyInlineText('错误：这是 label', theme);
    expect(out).toContain(`${GREEN}错误：${RESET}`);
    expect(out).not.toContain(RED);
  });

  it('"有问题/出现问题/存在问题" 标红，单独"问题"不标', () => {
    const out = beautifyInlineText('方案有问题，出现问题后存在问题排查', theme);
    expect(out).toContain(`${RED}有问题${RESET}`);
    expect(out).toContain(`${RED}出现问题${RESET}`);
    expect(out).toContain(`${RED}存在问题${RESET}`);
    // "问题排查" 中单独的问题不标（注意用词避免触发确认词 "需要"）
    expect(beautifyInlineText('做问题排查', theme)).toBe('做问题排查');
  });

  it('数量疑问词"多少"（多少个/多少钱/多少时间）→ 蓝色', () => {
    const out = beautifyInlineText('需要多少个文件？一共多少钱？还要多少时间？', theme);
    expect(out).toContain(`${BLUE}多少${RESET}`);
    expect(stripAnsi(out)).toBe('需要多少个文件？一共多少钱？还要多少时间？');
  });

  it('数量疑问词保守：差不多/多少有点 不误标（无独立"多少"语义）', () => {
    // "差不多" 不含连续"多少"，不标
    expect(beautifyInlineText('差不多完成了', theme)).toBe('差不多完成了');
    // "多少有点" 的"多少"=稍微，语义中性，可接受少量误标或按需调整
    // 此处验证 stripAnsi 保真
    expect(stripAnsi(beautifyInlineText('多少有点复杂', theme))).toBe('多少有点复杂');
  });

  it('警示 label（重要提示/注意/警告/危险/紧急）→ 红色加粗', () => {
    const out = beautifyInlineText('重要提示：请先备份数据', theme);
    // chalk.bold 包裹在红色之外：\x1b[1m + red + \x1b[22m
    expect(out).toContain(`${BOLD}${RED}重要提示：${RESET}${BOLD_OFF}`);
    expect(out).not.toContain(GREEN);
    expect(stripAnsi(out)).toBe('重要提示：请先备份数据');
  });

  it('警示 label 覆盖注意/警告/紧急，正文警示词不加重', () => {
    const out = beautifyInlineText('注意：磁盘空间不足，警告：请勿删除，紧急：立即处理', theme);
    expect(out).toContain(`${BOLD}${RED}注意：${RESET}${BOLD_OFF}`);
    expect(out).toContain(`${BOLD}${RED}警告：${RESET}${BOLD_OFF}`);
    expect(out).toContain(`${BOLD}${RED}紧急：${RESET}${BOLD_OFF}`);
    expect(stripAnsi(out)).toBe('注意：磁盘空间不足，警告：请勿删除，紧急：立即处理');
  });

  it('普通 label（摘要/错误/步骤）不受警示规则影响，保持绿色', () => {
    const out = beautifyInlineText('摘要：内容，错误：记录，步骤：执行', theme);
    expect(out).toContain(`${GREEN}摘要：${RESET}`);
    expect(out).toContain(`${GREEN}错误：${RESET}`);
    expect(out).toContain(`${GREEN}步骤：${RESET}`);
    expect(stripAnsi(out)).toBe('摘要：内容，错误：记录，步骤：执行');
  });
});
