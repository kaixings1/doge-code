import { readFileSync } from 'fs'
const content = readFileSync('src1/utils/debug.ts', 'utf-8')
const regex = /(from\s+['"])(\.\.\/\.\.\/([^'"]+))(['"])/g
const matches = [...content.matchAll(regex)]
console.log('Matches:', matches.length)
matches.forEach((m, i) => console.log(`${i}: ${m[0]}`))
