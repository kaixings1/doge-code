import fs from 'fs';
import path from 'path';
const extDir = 'D:/OpenSourceGit/openclaw-zero-token/extensions';
const outputDir = 'D:/doge-code/provider-configs/models';
fs.mkdirSync(outputDir, { recursive: true });
const dirs = fs.readdirSync(extDir).filter(d => {
 return fs.existsSync(path.join(extDir, d, 'openclaw.plugin.json'));
}).sort();
const allProviders = [];
dirs.forEach(d => {
 const pj = JSON.parse(fs.readFileSync(path.join(extDir, d, 'openclaw.plugin.json'), 'utf-8'));
 const info = {
 name: d,
 id: pj.id || d,
 envVars: [],
 baseUrl: '',
 modelCount: 0,
 models: []
 };
 Object.values(pj.providerAuthEnvVars || {}).forEach(v => v.forEach(x => info.envVars.push(x)));
 const modelsPath = path.join(extDir, d, 'models.ts');
 if (fs.existsSync(modelsPath)) {
 const ts = fs.readFileSync(modelsPath, 'utf-8');
 const baseIdx = ts.indexOf('BASE_URL');
 if (baseIdx >= 0) {
 const slice = ts.substring(baseIdx, baseIdx + 80);
 const q = slice.match(/['//x22]([^'//x22]+)['//x22]/);
 if (q) info.baseUrl = q[1];
 }
 info.modelCount = (ts.match(/contextWindow:/g) || []).length;
 }
 allProviders.push(info);
});
allProviders.sort((a, b) => b.modelCount - a.modelCount);
console.log('Provider 模型统计:');
allProviders.forEach(p => {
 console.log(p.name.padEnd(20) + ' ' + String(p.modelCount).padStart(3) + ' models ' + p.baseUrl);
});
fs.writeFileSync(path.join(outputDir, 'all-providers.json'), JSON.stringify(allProviders, null, 2));
console.log('已保存到 provider-configs/models/');
