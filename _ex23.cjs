const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const markers=['await Promise.all\(\[mcpConfigPromise','getTools\(toolPermissionContext','await Promise.all\(\[commandsPromise','showSetupScreens','await launchRepl']; 
for(const m of markers){const i=s.indexOf(m);console.log(m+' =;} 
