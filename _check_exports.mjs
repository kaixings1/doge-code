import fs from 'fs';
const pkg = JSON.parse(fs.readFileSync('./node_modules/@langchain/core/package.json', 'utf-8'));
const exp = pkg.exports;
const keys = Object.keys(exp);
console.log('总导出数量:', keys.length);
keys.forEach(k => console.log(k));
