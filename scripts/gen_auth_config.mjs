import fs from 'fs';
import path from 'path';
const extDir = 'D:/OpenSourceGit/openclaw-zero-token/extensions';
const outDir = 'D:/doge-code/provider-configs/auth';
fs.mkdirSync(outDir, { recursive: true });
const dirs = fs.readdirSync(extDir).filter(d => {
 return fs.existsSync(path.join(extDir, d, 'openclaw.plugin.json'));
}).sort();
let count = 0;
dirs.forEach(d => {
 const pj = JSON.parse(fs.readFileSync(path.join(extDir, d, 'openclaw.plugin.json'), 'utf-8'));
 const cfg = {
 id: pj.id || d,
 name: d,
 envVars: [],
 authMethods: [],
 baseUrl: '',
 description: (pj.description || '').substring(0, 120)
 };
 Object.values(pj.providerAuthEnvVars || {}).forEach(v => v.forEach(x => cfg.envVars.push(x)));
 (pj.providerAuthChoices || []).forEach(c => {
 cfg.authMethods.push({label: c.choiceLabel, method: c.method, cliFlag: c.cliFlag});
 });
 const modelsPath = path.join(extDir, d, 'models.ts');
 if (fs.existsSync(modelsPath)) {
 const ts = fs.readFileSync(modelsPath, 'utf-8');
 const bi = ts.indexOf('BASE_URL');
 if (bi >= 0) {
 const sl = ts.substring(bi, bi + 80);
 const q = sl.match(/[//x27//x22]([^//x27//x22]+)[//x27//x22]/);
 if (q) cfg.baseUrl = q[1];
 }
 }
 // 生成Doge兼容的.env参考
 cfg.dogeEnvExample = {};
 cfg.envVars.forEach(v => { cfg.dogeEnvExample[v] = '<YOUR_' + v + '>'; });
 if (cfg.baseUrl) cfg.dogeEnvExample.ANTHROPIC_BASE_URL = cfg.baseUrl;
 fs.writeFileSync(path.join(outDir, d + '.json'), JSON.stringify(cfg, null, 2));
 count++;
});
console.log('生成 ' + count + ' 个认证配置文件');
