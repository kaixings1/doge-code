const fs = require('fs');
const path = 'D:/doge-code/desktop/test-real-impl.js';
let content = fs.readFileSync(path, 'utf-8');

console.log('Before T7:');
const t7Before = content.match(/T7:[\s\S]*?assert.*buf[^;]*;/);
console.log(t7Before ? t7Before[0] : 'NOT FOUND');

// T7: Update buf assertion
content = content.replace(
  /assert\(buf\.indexOf\(F_START\(\) \+ ' name="Test'\) !== -1\);/,
  "assert(buf === ' name=\"Test\"', 'buf=' + JSON.stringify(buf));"
);

console.log('\nBefore T15:');
const t15Before = content.match(/T15:[\s\S]*?assert.*tool_use[^;]*;/);
console.log(t15Before ? t15Before[t15Before.length-1] : 'NOT FOUND');

// T15 already updated, no need to change

fs.writeFileSync(path, content, 'utf-8');
console.log('\nUpdated test-real-impl.js');

// Verify
const verify = fs.readFileSync(path, 'utf-8');
console.log('\nAfter T7:');
const t7After = verify.match(/T7:[\s\S]*?assert.*buf[^;]*;/);
console.log(t7After ? t7After[0] : 'NOT FOUND');