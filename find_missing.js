import * as fs from 'node:fs'
import * as path from 'node:path'

const srcDir = 'D:/doge-code/src'

function checkMissing(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      checkMissing(full)
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.d.ts')) {
      const jsPath = full.replace(/\.tsx$/, '.js')
      if (!fs.existsSync(jsPath)) {
        const rel = path.relative(srcDir, full)
        const relJs = rel.replace(/\.tsx$/, '.js')
        console.log('MISSING: src/' + rel + ' -> need ' + relJs)
      }
    }
  }
}

checkMissing(srcDir)
