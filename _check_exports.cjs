const pkg = require('./node_modules/@langchain/core/package.json');
const exports = pkg.exports;
const keys = Object.keys(exports);
console.log('总导出数量:', keys.length);
keys.forEach(k => console.log(k));
