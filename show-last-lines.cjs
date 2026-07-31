const fs = require('fs')
const data = fs.readFileSync('D:/doge-code/build-output21.log', 'utf-8')
const lines = data.split('\n')
const failIdx = lines.findIndex(l => l.includes('Build failed'))
if (failIdx >= 0) {
  for (let i = failIdx; i < Math.min(failIdx + 8, lines.length); i++) {
    console.log(lines[i])
  }
} else {
  console.log('No Build failed found')
}
