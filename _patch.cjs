import { writeFileSync } from 'fs'  
const s = require('fs').readFileSync('src/main.tsx', 'utf8')  
const marks = ['正在加载 MCP 配置', '正在运行 setup()', 'setup() 完成', '正在加载命令和代理', 'await launchRepl']  
for (const m of marks) {  
  const i = s.indexOf(m)  
  console.log(m + ' = + i)  
}  
