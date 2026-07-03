const fs = require('fs');
const path = require('path'); const skillsDir = 'D:/doge-code/.claude/skills';
const dirs = fs.readdirSync(skillsDir).filter(d => { const p = path.join(skillsDir, d, 'SKILL.md'); return fs.existsSync(p);
}); let need = [];
for (const d of dirs) { const fpath = path.join(skillsDir, d, 'SKILL.md'); const content = fs.readFileSync(fpath, 'utf-8'); if (!/[/u4e00-/u9fff]/.test(content)) continue; const lines = content.split('/n'); let inDesc = false, descEnded = false, descHasCn = false, bodyHasCn = false; for (const line of lines) { const s = line.trim(); if (s === '---') { if (!inDesc) inDesc = true; else descEnded = true; continue; } if (inDesc && !descEnded && /[/u4e00-/u9fff]/.test(line)) descHasCn = true; if (descEnded && /[/u4e00-/u9fff]/.test(line)) { bodyHasCn = true; break; } } if (descHasCn && !bodyHasCn) { const lineCount = lines.length; need.push({ dir: d, lines: lineCount }); }
} need.sort((a, b) => a.lines - b.lines);
console.log('Need body translation:', need.length);
need.forEach(n => console.log(`${n.dir} (${n.lines} lines)`));
