const m = require('./src/reversibility.js');
const cases = [
  '删除 users 表。',
  '批量处理所有记录。',
  '修改生产环境变量 API_KEY=xxx。'
];
for (const c of cases) {
  console.log(JSON.stringify(m.checkReversibility(c)));
}
