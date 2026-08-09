import { describe, it, expect } from 'vitest';
import {
  extractPythonBlocks,
  extractCodeBlocks,
  parseEditCommands,
  applyEditCommands,
  applyPatch,
  applyDiffFormat,
} from '../../src/engine/testDrivenFix/patchParser.js';
import {
  extractSymbolsWithRanges,
  isTestFile,
  isCodeFile,
  mergeIntervals,
  wrapContentWithLines,
} from '../../src/engine/testDrivenFix/repoStructure.js';
import {
  buildFileLocalizePrompt,
  buildCodeLocalizePrompt,
  buildRepairPrompt,
  buildProblemFromTestFailure,
  formatRepoStructure,
} from '../../src/engine/testDrivenFix/localize.js';
import {
  parseTestFailures,
  isTestPassing,
} from '../../src/engine/testDrivenFix/fixLoop.js';

// ============================================================================
// patchParser
// ============================================================================

describe('extractPythonBlocks', () => {
  it('提取 python 代码块', () => {
    const out = '```python\nedit_file(1, 1, "x")\n```';
    expect(extractPythonBlocks(out)).toEqual(['edit_file(1, 1, "x")']);
  });

  it('提取多个代码块', () => {
    const out = '```python\na\n```\ntext\n```python\nb\n```';
    expect(extractPythonBlocks(out)).toEqual(['a', 'b']);
  });

  it('无代码块返回空数组', () => {
    expect(extractPythonBlocks('plain text')).toEqual([]);
  });
});

describe('extractCodeBlocks', () => {
  it('提取通用代码块', () => {
    expect(extractCodeBlocks('```\ncode\n```')).toEqual(['code']);
  });

  it('不完整代码块兜底', () => {
    expect(extractCodeBlocks('prefix ```\nrest')).toEqual(['rest']);
  });
});

describe('parseEditCommands', () => {
  it('解析单文件 edit_file(start, end, content)', () => {
    const out = '```python\nedit_file(1, 1, "import os")\n```';
    const cmds = parseEditCommands(out);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({ file: '', start: 1, end: 1, content: 'import os' });
  });

  it('解析带文件名 edit_file(file, start, end, content)', () => {
    const out = "```python\nedit_file('src/foo.ts', 10, 12, 'new')\n```";
    const cmds = parseEditCommands(out);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].file).toBe('src/foo.ts');
    expect(cmds[0].start).toBe(10);
    expect(cmds[0].end).toBe(12);
    expect(cmds[0].content).toBe('new');
  });

  it('解析三引号多行内容', () => {
    const out = "```python\nedit_file(1, 1, '''import os\nimport sys''')\n```";
    const cmds = parseEditCommands(out);
    expect(cmds[0].content).toBe('import os\nimport sys');
  });

  it('解析多个命令', () => {
    const out = '```python\nedit_file(1, 1, "a")\nedit_file(2, 2, "b")\n```';
    expect(parseEditCommands(out)).toHaveLength(2);
  });

  it('无 edit_file 返回空', () => {
    expect(parseEditCommands('no commands here')).toEqual([]);
  });
});

describe('applyEditCommands', () => {
  it('替换单行', () => {
    const content = 'import sys';
    const result = applyEditCommands(
      [{ file: '', start: 1, end: 1, content: 'import os' }],
      content,
    );
    expect(result).toBe('import os');
  });

  it('按行号倒序应用（先改后面的行）', () => {
    // 第 1 行替换为 2 行 → 后面的行号不偏移
    const content = 'line1\nline2\nline3';
    const result = applyEditCommands(
      [
        { file: '', start: 1, end: 1, content: 'new1' },
        { file: '', start: 3, end: 3, content: 'new3' },
      ],
      content,
    );
    expect(result).toBe('new1\nline2\nnew3');
  });

  it('删除行（空 content）', () => {
    const content = 'a\nb\nc';
    const result = applyEditCommands(
      [{ file: '', start: 2, end: 2, content: '' }],
      content,
    );
    expect(result).toBe('a\nc');
  });

  it('替换行范围', () => {
    const content = 'a\nb\nc\nd';
    const result = applyEditCommands(
      [{ file: '', start: 2, end: 3, content: 'x\ny' }],
      content,
    );
    expect(result).toBe('a\nx\ny\nd');
  });

  it('重复命令去重', () => {
    const content = 'a\nb';
    const result = applyEditCommands(
      [
        { file: '', start: 1, end: 1, content: 'x' },
        { file: '', start: 1, end: 1, content: 'x' },
      ],
      content,
    );
    expect(result).toBe('x\nb');
  });
});

describe('applyPatch', () => {
  it('按文件分组应用', () => {
    const patch = applyPatch(
      [
        { file: 'a.ts', start: 1, end: 1, content: 'A1' },
        { file: 'b.ts', start: 2, end: 2, content: 'B2' },
      ],
      { 'a.ts': 'old-a', 'b.ts': 'x\nold-b' },
    );
    expect(patch.editedFiles).toHaveLength(2);
    expect(patch.appliedCount).toBe(2);
    const a = patch.contents.find((c) => c.file === 'a.ts');
    expect(a?.new).toBe('A1');
  });

  it('文件不存在时记录失败', () => {
    const patch = applyPatch(
      [{ file: 'missing.ts', start: 1, end: 1, content: 'x' }],
      {},
    );
    expect(patch.appliedCount).toBe(0);
    expect(patch.failedCommands).toHaveLength(1);
  });

  it('单文件命令应用到唯一文件', () => {
    const patch = applyPatch(
      [{ file: '', start: 1, end: 1, content: 'new' }],
      { 'only.ts': 'old' },
    );
    expect(patch.contents[0].file).toBe('');
    expect(patch.contents[0].new).toBe('new');
  });
});

describe('applyDiffFormat', () => {
  it('应用 SEARCH/REPLACE', () => {
    const raw = `### src/foo.ts
<<<<<<< SEARCH
import old from './old'
=======
import new1 from './new1'
>>>>>>> REPLACE`;
    const patch = applyDiffFormat(raw, { 'src/foo.ts': 'import old from \'./old\'\n' });
    expect(patch.appliedCount).toBe(1);
    expect(patch.contents[0]?.new).toContain('import new1');
  });

  it('无匹配的 SEARCH 块不应用', () => {
    const raw = `### a.ts
<<<<<<< SEARCH
not-present
=======
replacement
>>>>>>> REPLACE`;
    const patch = applyDiffFormat(raw, { 'a.ts': 'actual content' });
    expect(patch.appliedCount).toBe(0);
  });
});

// ============================================================================
// repoStructure
// ============================================================================

describe('isTestFile', () => {
  it('识别 *.test.ts / *.spec.ts', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('src/foo.spec.js')).toBe(true);
    expect(isTestFile('test/foo.py')).toBe(true);
    expect(isTestFile('tests/unit/a.test.ts')).toBe(true);
  });

  it('非测试文件', () => {
    expect(isTestFile('src/foo.ts')).toBe(false);
    expect(isTestFile('src/foo.tsx')).toBe(false);
  });
});

describe('isCodeFile', () => {
  it('代码文件', () => {
    expect(isCodeFile('a.ts')).toBe(true);
    expect(isCodeFile('a.py')).toBe(true);
    expect(isCodeFile('a.json')).toBe(true);
  });

  it('非代码文件', () => {
    expect(isCodeFile('a.md')).toBe(false);
    expect(isCodeFile('a.txt')).toBe(false);
  });
});

describe('extractSymbolsWithRanges', () => {
  const ts = `import { x } from './x'

export class MyClass {
  private count = 0

  method1() {
    return this.count
  }

  method2() {
    return 2
  }
}

export function helper() {
  return 'help'
}
`;

  it('提取类与函数及起止行', () => {
    const syms = extractSymbolsWithRanges(ts, 'a.ts');
    const cls = syms.find((s) => s.name === 'MyClass');
    const fn = syms.find((s) => s.name === 'helper');
    expect(cls?.kind).toBe('class');
    expect(cls?.startLine).toBe(3);
    expect(fn?.kind).toBe('function');
    expect(fn?.startLine).toBe(15);
    expect(fn?.endLine).toBeGreaterThanOrEqual(fn!.startLine);
  });
});

describe('mergeIntervals', () => {
  it('合并重叠区间', () => {
    expect(mergeIntervals([[1, 3], [2, 5], [7, 8]])).toEqual([[1, 5], [7, 8]]);
  });

  it('空输入', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe('wrapContentWithLines', () => {
  it('全文件加行号', () => {
    const out = wrapContentWithLines('a\nb');
    expect(out).toBe('1|a\n2|b');
  });

  it('区间加行号 + 省略号', () => {
    const out = wrapContentWithLines('a\nb\nc\nd\ne', [[2, 4]]);
    expect(out).toContain('...');
    expect(out).toContain('2|b');
    expect(out).toContain('3|c');
    expect(out).toContain('4|d');
  });
});

// ============================================================================
// localize
// ============================================================================

describe('formatRepoStructure', () => {
  it('格式化文件与符号', () => {
    const out = formatRepoStructure({
      symbols: {
        'src/a.ts': [
          { name: 'Foo', kind: 'class', startLine: 1, endLine: 10, file: 'src/a.ts' },
        ],
      },
      testFiles: [],
    });
    expect(out).toContain('src/a.ts/');
    expect(out).toContain('class Foo');
  });
});

describe('buildFileLocalizePrompt', () => {
  it('包含问题描述与结构', () => {
    const prompt = buildFileLocalizePrompt('bug: crash', {
      symbols: {},
      testFiles: [],
    });
    expect(prompt).toContain('bug: crash');
    expect(prompt).toContain('Repository Structure');
    expect(prompt).toContain('at most 5 files');
  });
});

describe('buildCodeLocalizePrompt', () => {
  it('包含文件内容', () => {
    const prompt = buildCodeLocalizePrompt('bug', { 'a.py': 'def f():\n  pass' });
    expect(prompt).toContain('a.py');
    expect(prompt).toContain('def f()');
    expect(prompt).toContain('line:');
  });
});

describe('buildRepairPrompt', () => {
  it('包含 edit_file 指令', () => {
    const prompt = buildRepairPrompt('bug', { 'a.py': 'x = 1' });
    expect(prompt).toContain('edit_file');
    expect(prompt).toContain('--- BEGIN FILE ---');
    expect(prompt).toContain('x = 1');
  });

  it('CoT 模式增加先定位指令', () => {
    const plain = buildRepairPrompt('bug', { 'a.py': 'x' }, new Map(), false);
    const cot = buildRepairPrompt('bug', { 'a.py': 'x' }, new Map(), true);
    expect(cot).toContain('first localize');
    expect(plain).not.toContain('first localize');
  });
});

describe('buildProblemFromTestFailure', () => {
  it('提取失败测试输出', () => {
    const out = buildProblemFromTestFailure(
      'FAIL src/a.test.ts > suite > case\nAssertionError: expected 1 to be 2\n    at src/a.ts:10',
    );
    expect(out).toContain('FAIL');
    expect(out).toContain('AssertionError');
    expect(out).toContain('test is failing');
  });
});

// ============================================================================
// fixLoop
// ============================================================================

describe('parseTestFailures', () => {
  it('解析 vitest/jest FAIL 格式', () => {
    const failures = parseTestFailures(
      'FAIL src/a.test.ts > suite > case\nAssertionError: expected 1 to be 2',
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].file).toContain('a.test.ts');
  });

  it('解析 pytest FAILED 格式', () => {
    const failures = parseTestFailures(
      'FAILED test_x.py::test_case - AssertionError: boom',
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].testName).toBe('test_case');
    expect(failures[0].message).toContain('boom');
  });

  it('解析 go FAIL 格式', () => {
    const failures = parseTestFailures('--- FAIL: TestFoo (0.01s)');
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].testName).toBe('TestFoo');
  });

  it('无失败返回空', () => {
    expect(parseTestFailures('all passed')).toEqual([]);
  });
});

describe('isTestPassing', () => {
  it('通过', () => {
    expect(isTestPassing('Tests: 5 passed')).toBe(true);
    expect(isTestPassing('5 passed, 0 failed')).toBe(true);
  });

  it('失败', () => {
    expect(isTestPassing('Tests: 1 failed')).toBe(false);
    expect(isTestPassing('FAILED test.py::t')).toBe(false);
    expect(isTestPassing('--- FAIL: TestX (0.01s)')).toBe(false);
    expect(isTestPassing('2 failing')).toBe(false);
  });

  it('无法判断视为失败', () => {
    expect(isTestPassing('something')).toBe(false);
  });
});
