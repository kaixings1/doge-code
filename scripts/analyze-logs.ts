import { readFileSync } from 'fs';
import { join } from 'path';

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stack?: string;
}

export function analyzeLogs(logFile: string): {
  total: number;
  errors: LogEntry[];
  warnings: LogEntry[];
  summary: Record<string, number>;
} {
  const content = readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  const entries: LogEntry[] = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return {
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: line,
      };
    }
  });

  const errors = entries.filter((e) => e.level === 'error');
  const warnings = entries.filter((e) => e.level === 'warn');

  // 统计错误类型
  const summary: Record<string, number> = {};
  for (const error of errors) {
    const type = error.message.split(':')[0];
    summary[type] = (summary[type] || 0) + 1;
  }

  return {
    total: entries.length,
    errors,
    warnings,
    summary,
  };
}

// 使用示例
const report = analyzeLogs('./debug.txt');
console.log('Total logs:', report.total);
console.log('Errors:', report.errors.length);
console.log('Warnings:', report.warnings.length);
console.log('Error summary:', report.summary);