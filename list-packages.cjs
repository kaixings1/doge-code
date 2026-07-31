const fs = require('node:fs')
const path = require('node:path')

const nodeModulesDir = path.resolve('node_modules')
const packages = []

try {
  const entries = fs.readdirSync(nodeModulesDir)
  for (const name of entries) {
    if (name.startsWith('.') || name === 'bin' || name === '.bin') continue
    const pkgPath = path.join(nodeModulesDir, name, 'package.json')
    if (fs.existsSync(pkgPath)) {
      packages.push(name)
    }
  }
} catch (err) {
  console.error('Error reading node_modules:', err)
}

console.log(JSON.stringify(packages, null, 2))
console.log('Total:', packages.length)
