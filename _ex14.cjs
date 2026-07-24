const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('[STARTUP] 正在加载 MCP 配置'); 
fs.writeFileSync('_mcp.txt', s.substring(i-300,i+600)); 
