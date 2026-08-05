// 查看指定文件的错误（前 N 条）
const fs = require('fs');
const target = process.argv[2] || 'src/cli/print.ts';
const limit = parseInt(process.argv[3] || '40', 10);
const lines = fs.readFileSync('D:/doge-code/tsc-current-errors.txt', 'utf8').replace(/\r/g, '').split('\n').filter((x) => x.includes(target));
const counts = {};
for (const x of lines) {
  const m = x.match(/error (TS\d+)/);
  if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
}
console.log(target, '错误数:', lines.length, JSON.stringify(counts));
for (const x of lines.slice(0, limit)) {
  console.log(' ', x.replace(/^.*?\((\d+),(\d+)\): error (TS\d+): /, 'L$1:C$2 [$3] '));
}
