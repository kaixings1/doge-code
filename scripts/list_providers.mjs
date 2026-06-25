import fs from 'fs';
import path from 'path';
const extDir = 'D:/OpenSourceGit/openclaw-zero-token/extensions';
const outputDir = 'D:/doge-code/provider-configs/models';
fs.mkdirSync(outputDir, { recursive: true });
const dirs = fs.readdirSync(extDir).filter(d => {
 return fs.existsSync(path.join(extDir, d, 'openclaw.plugin.json'));
}).sort();
console.log('找到 ' + dirs.length + ' 个provider');
dirs.forEach(d => console.log(' ' + d));
fs.writeFileSync(path.join(outputDir, 'provider-dirs.json'), JSON.stringify(dirs, null, 2));
console.log('已保存');
