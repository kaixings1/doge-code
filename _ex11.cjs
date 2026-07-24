const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('正在加载 MCP 配置'); 
fs.writeFileSync('_mcpstart.txt', i+'\n'+s.substring(i-200,i+800)); 
