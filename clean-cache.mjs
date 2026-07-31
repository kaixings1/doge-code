import fs from 'fs'
import path from 'path'

const dirs = ['node_modules/.vite', 'desktop-electron/dist']
for (const dir of dirs) {
  const full = path.resolve(dir)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true })
    console.log('cleaned:', dir)
  }
}
console.log('done')
