import fs from 'fs';
import path from 'path';
const d = 'D:/doge-code/.claude/agents';
const files = fs.readdirSync(d).filter(f => f.endsWith('.md'));
let ok = 0, fail = 0, issues = [];
files.forEach(f => {
 const c = fs.readFileSync(path.join(d, f), 'utf-8');
 const m = c.match(/^---/s*/n([/s/S]*?)---/);
 if (!m) { fail++; issues.push(f + ': no frontmatter'); return; }
 const fm = m[1];
 if (!fm.match(/^name/s*:/m)) { fail++; issues.push(f + ': missing name'); return; }
 if (!fm.match(/^description/s*:/m)) { fail++; issues.push(f + ': missing description'); return; }
 ok++;
});
console.log('total: ' + files.length + ', ok: ' + ok + ', fail: ' + fail);
issues.forEach(i => console.log(' ' + i));
