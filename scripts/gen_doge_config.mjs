import fs from 'fs';
import path from 'path';
const extDir = 'D:/OpenSourceGit/openclaw-zero-token/extensions';

// 读取所有认证配置
const authDir = 'D:/doge-code/provider-configs/auth';
const files = fs.readdirSync(authDir).filter(f => f.endsWith('.json'));
let dogsEnv = '# Doge Code Provider Environment Variables' + String.fromCharCode(10);
dogsEnv += '# 从 OpenClaw zero-token 自动生成' + String.fromCharCode(10);
dogsEnv += '# 使用方法: 取消注释需要的provider并填入API密钥' + String.fromCharCode(10);
dogsEnv += String.fromCharCode(10);

let jsonIndex = {};

files.sort().forEach(f => {
 const cfg = JSON.parse(fs.readFileSync(path.join(authDir, f), 'utf-8'));
 if (cfg.envVars.length === 0) return;
 dogsEnv += '# --- ' + cfg.name + ' (' + cfg.id + ') ---' + String.fromCharCode(10);
 if (cfg.description) dogsEnv += '# ' + cfg.description + String.fromCharCode(10);
 if (cfg.baseUrl) dogsEnv += '# Base URL: ' + cfg.baseUrl + String.fromCharCode(10);
 cfg.envVars.forEach(v => {
 dogsEnv += '# ' + v + '=<your-key>' + String.fromCharCode(10);
 });
 dogsEnv += String.fromCharCode(10);
 jsonIndex[cfg.name] = {
 id: cfg.id,
 envVars: cfg.envVars,
 baseUrl: cfg.baseUrl
 };
});

fs.writeFileSync('D:/doge-code/provider-configs/.env.example', dogsEnv, 'utf-8');
fs.writeFileSync('D:/doge-code/provider-configs/provider-env-map.json', JSON.stringify(jsonIndex, null, 2), 'utf-8');
console.log('生成完成');
