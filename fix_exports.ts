import { readFileSync, writeFileSync } from 'fs'
import { globSync } from 'glob'

const files = globSync('src/commands/*/index.ts').concat(globSync('src/commands/*.ts'))
let changed = 0
let skipped = 0

for (const f of files) {
  let content = readFileSync(f, 'utf-8')

  // Match: const name = { ... } export default name
  // Add 'export' before 'const'
  const newContent = content.replace(
    /^(const (\w+) = \{[^]+?\n\})\nexport default \2/m,
    'export $1\nexport default $2'
  )

  if (newContent !== content) {
    writeFileSync(f, newContent, 'utf-8')
    console.log(`  Fixed: ${f}`)
    changed++
  } else {
    skipped++
  }
}

console.log(`\nChanged: ${changed}, Skipped: ${skipped}`)
