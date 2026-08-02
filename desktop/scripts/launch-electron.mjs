import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const mainEntry = path.join(distDir, 'main', 'index.mjs')

// Step 1: Build (use build.mjs which handles full build pipeline)
console.log('Building...')
const buildScript = path.join(projectRoot, 'scripts', 'build.mjs')
const { execSync } = await import('child_process')
try {
  execSync(`node "${buildScript}"`, { cwd: projectRoot, stdio: 'inherit' })
} catch (e) {
  console.warn('Build had warnings, checking if output exists...')
}

if (!fs.existsSync(mainEntry)) {
  console.error('Build failed: main entry not found at', mainEntry)
  process.exit(1)
}

console.log('Starting Electron...')

const electronBinary = path.join(projectRoot, 'node_modules', '.bin', 'electron.exe')
if (!fs.existsSync(electronBinary)) {
  console.error('Electron binary not found at', electronBinary)
  process.exit(1)
}

const child = spawn(electronBinary, [mainEntry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DOGE_DESKTOP: '1',
    DOGE_API_JSON: path.join(projectRoot, '..', '.doge', 'api.json'),
  },
})

child.on('error', (err) => {
  console.error('Failed to start Electron:', err.message)
  process.exit(1)
})

await new Promise((resolve) => child.on('exit', resolve))
