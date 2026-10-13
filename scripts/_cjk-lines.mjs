import fs from 'node:fs'

const file = process.argv[2]
const src = fs.readFileSync(file, 'utf8').split('\n')
const re = /[\u4e00-\u9fa5]/
let n = 0
src.forEach((l, i) => {
  if (re.test(l)) {
    n++
    console.log((i + 1) + ': ' + l.trim())
  }
})
console.log('--- total lines with CJK: ' + n + ' ---')
