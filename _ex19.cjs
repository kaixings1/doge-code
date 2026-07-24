const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const marker='await Promise.all([mcpConfigPromise, prefetchAllMcpResources(mcpConfigResult, mcpServers)])'; 
const i=s.indexOf(marker); 
fs.writeFileSync('_mcpawait.txt', s.substring(i-200,i+400)); 
