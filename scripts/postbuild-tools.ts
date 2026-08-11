import { cpSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const outfile = process.env.CLAUDE_CODE_BUILD_OUTFILE?.trim() || join(projectRoot, 'doge.exe')
const outdir = dirname(outfile)
const toolsSrc = join(projectRoot, '.doge', 'tools')
const toolsDst = join(outdir, '.tools')

if (!existsSync(toolsSrc)) {
  console.error('.tools/ directory not found at', toolsSrc)
  process.exit(1)
}

cpSync(toolsSrc, toolsDst, { recursive: true })
console.log(`Copied .tools/ to ${toolsDst}`)
