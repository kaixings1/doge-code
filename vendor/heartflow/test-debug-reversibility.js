const fs=require('fs');
const src=fs.readFileSync('src/reversibility.js','utf8');

// Instrument RegExp.prototype.exec to detect infinite loops
const origExec = RegExp.prototype.exec;
let execCount = 0;
let lastRegex = null;
RegExp.prototype.exec = function(text) {
  execCount++;
  const srcStr = this.source.slice(0,60);
  if (execCount <= 20) console.log('exec #' + execCount + ' pattern=' + srcStr + ' lastIndex=' + this.lastIndex);
  lastRegex = srcStr;
  if (execCount > 1000) {
    console.log('INFINITE LOOP on pattern: ' + srcStr);
    console.log('text snippet:', text.slice(0, 100));
    throw new Error('infinite loop detected');
  }
  return origExec.call(this, text);
};

const m = require('./src/reversibility.js');
console.log('module loaded, checking...');
try {
  const r = m.checkReversibility('删除 users 表。');
  console.log('result=' + JSON.stringify(r));
  console.log('total exec calls:', execCount);
} catch (e) {
  console.log('error:', e.message);
  console.log('total exec calls before error:', execCount);
  console.log('last regex:', lastRegex);
}
