const fs=require('fs');
const p='src/knowledge/classics-rules.js';
const t=fs.readFileSync(p,'utf-8');
const markers=[
'const ev = [];',
'function evaluateRules(input) {',
'const CLASSICAL_RULES = [',
'const WISDOM_DIMENSION_MAP = {',
'domain = { id: \'daoist-naturalness\'',
];
for (const m of markers){
  const i=t.indexOf(m);
  console.log('---',m,'---',i);
  if (i>=0) {
    if (m==='function evaluateRules(input) {') console.log(t.slice(i,i+1300));
    else console.log(t.slice(i,i+400));
  }
}
