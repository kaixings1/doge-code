const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve('.')
const source = 'src/utils/processUserInput/processSlashCommand.js'
const dotIdx = source.lastIndexOf('.')
const ext = source.slice(dotIdx)
const baseForSearch = path.resolve(projectRoot, source.slice(0, dotIdx))

console.log('ext:', ext)
console.log('baseForSearch:', baseForSearch)

const candidates = ['.tsx', '.ts', '.jsx', '.js']
for (const tryExt of candidates) {
  const candidate = baseForSearch + tryExt
  console.log('checking:', candidate, 'exists:', fs.existsSync(candidate))
}

// Also check the importer-based resolution
const importer = 'D:/doge-code/src/tools/SkillTool/SkillTool.ts'
const importerDir = path.dirname(importer)
const relSource = './processSlashCommand.js'
const relDotIdx = relSource.lastIndexOf('.')
const relBase = path.resolve(importerDir, relSource.slice(0, relDotIdx))
console.log('\nimporter dir:', importerDir)
console.log('relative base:', relBase)
for (const tryExt of candidates) {
  const candidate = relBase + tryExt
  console.log('checking relative:', candidate, 'exists:', fs.existsSync(candidate))
}
