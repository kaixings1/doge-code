const fs = require('fs')
const path = 'D:/doge-code/desktop/src/renderer/shared.tsx'
let content = fs.readFileSync(path, 'utf8')

// Replace the broken template literal line with concatenation
content = content.replace(
  '    return `<div style="position:relative;margin:4px 0" data-code="${escaped}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">${langLabel}<button onclick="navigator.clipboard.writeText(this.closest(\'div\').getAttribute(\'data-code\')).catch(()=>{})" style="background:;border:1px solid ;color:;padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px">复制</button></div><pre style="background:;border:1px solid ;border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0"><code>${highlighted}</code></pre></div>`',
  "    return '<div style=\"position:relative;margin:4px 0\" data-code=\"' + escaped + '\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:2px\">' + langLabel + '<button onclick=\"navigator.clipboard.writeText(this.closest(\\'div\\').getAttribute(\\'data-code\\')).catch(()=>{})\" style=\"background:' + colors.border + ';border:1px solid ' + colors.border + ';color:' + colors.textMuted + ';padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px\">复制</button></div><pre style=\"background:' + colors.codeBg + ';border:1px solid ' + colors.border + ';border-radius:4px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.5;margin:0\"><code>' + highlighted + '</code></pre></div>'"
)

fs.writeFileSync(path, content)
console.log('shared.tsx fixed')
