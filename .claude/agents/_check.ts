import fs from "fs";
import path from "path"; const dir = "D:/doge-code/.claude/agents";
const files: string[] = [];
function walk(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".md")) files.push(f); }
}
walk(dir); let hasCN = 0;
let noCN = 0;
for (const f of files) { const body = fs.readFileSync(f, "utf8").replace(/^---.*?---/s, ""); if (/[/u4e00-/u9fff]/.test(body)) { hasCN++; } else { noCN++; if (noCN <= 100) console.log(path.relative(dir, f)); }
}
console.log(`Has Chinese: ${hasCN}`);
console.log(`No Chinese: ${noCN}`);
