import { readFileSync } from 'fs';
import { parse } from 'yaml';

export interface CoverageThresholds {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export function checkCoverage(
  coverageFile: string,
  thresholds: CoverageThresholds
): boolean {
  const content = readFileSync(coverageFile, 'utf-8');
  const coverage = JSON.parse(content);

  const results: Array<{ file: string; metric: string; actual: number; required: number; passed: boolean }> = [];

  for (const [file, fileCoverage] of Object.entries(coverage)) {
    const coverageData = fileCoverage as any;

    results.push({
      file,
      metric: 'lines',
      actual: coverageData.lines.pct,
      required: thresholds.lines,
      passed: coverageData.lines.pct >= thresholds.lines,
    });

    results.push({
      file,
      metric: 'functions',
      actual: coverageData.functions.pct,
      required: thresholds.functions,
      passed: coverageData.functions.pct >= thresholds.functions,
    });

    results.push({
      file,
      metric: 'branches',
      actual: coverageData.branches.pct,
      required: thresholds.branches,
      passed: coverageData.branches.pct >= thresholds.branches,
    });

    results.push({
      file,
      metric: 'statements',
      actual: coverageData.statements.pct,
      required: thresholds.statements,
      passed: coverageData.statements.pct >= thresholds.statements,
    });
  }

  // 输出结果
  console.log('Coverage Report:');
  console.log('================');
  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.file} - ${result.metric}: ${result.actual.toFixed(2)}% (required: ${result.required}%)`);
  }

  const allPassed = results.every((r) => r.passed);
  return allPassed;
}

// 使用示例
if (import.meta.url === `file://${process.argv[1]}`) {
  const thresholds: CoverageThresholds = {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80,
  };

  const passed = checkCoverage('./coverage/coverage-final.json', thresholds);
  process.exit(passed ? 0 : 1);
}