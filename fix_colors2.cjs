const fs = require('fs')

// Fix App.tsx - convert ${c.xxx} in single-quoted strings to concatenation
let app = fs.readFileSync('D:/doge-code/desktop/src/renderer/App.tsx', 'utf8')

app = app.replace(/color:\$\{c\.string\}/g, "color:' + c.string + '")
app = app.replace(/color:\$\{c\.keyword\}/g, "color:' + c.keyword + '")
app = app.replace(/color:\$\{c\.number\}/g, "color:' + c.number + '")
app = app.replace(/color:\$\{c\.comment\}/g, "color:' + c.comment + '")
app = app.replace(/color:\$\{c\.property\}/g, "color:' + c.property + '")
app = app.replace(/;\$\{fs\}/g, ";' + fs + '")

fs.writeFileSync('D:/doge-code/desktop/src/renderer/App.tsx', app)
console.log('App.tsx fixed')

// Fix shared.tsx
let shared = fs.readFileSync('D:/doge-code/desktop/src/renderer/shared.tsx', 'utf8')

shared = shared.replace(/color:\$\{c\.string\}/g, "color:' + c.string + '")
shared = shared.replace(/color:\$\{c\.keyword\}/g, "color:' + c.keyword + '")
shared = shared.replace(/color:\$\{c\.number\}/g, "color:' + c.number + '")
shared = shared.replace(/color:\$\{c\.comment\}/g, "color:' + c.comment + '")
shared = shared.replace(/color:\$\{c\.property\}/g, "color:' + c.property + '")

fs.writeFileSync('D:/doge-code/desktop/src/renderer/shared.tsx', shared)
console.log('shared.tsx fixed')

// Fix MarkdownRenderer.tsx
let md = fs.readFileSync('D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx', 'utf8')

md = md.replace(/color:\$\{c\.string\}/g, "color:' + c.string + '")
md = md.replace(/color:\$\{c\.keyword\}/g, "color:' + c.keyword + '")
md = md.replace(/color:\$\{c\.number\}/g, "color:' + c.number + '")
md = md.replace(/color:\$\{c\.comment\}/g, "color:' + c.comment + '")
md = md.replace(/color:\$\{c\.property\}/g, "color:' + c.property + '")

fs.writeFileSync('D:/doge-code/desktop/src/renderer/components/MarkdownRenderer.tsx', md)
console.log('MarkdownRenderer.tsx fixed')

console.log('Done')
