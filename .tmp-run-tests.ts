import { execSync } from 'child_process'

try {
  const result = execSync('bun test 2>&1', { encoding: 'utf-8', cwd: 'D:/doge-code' })
  console.log(result)
} catch (e: any) {
  console.log(e.stdout || '')
  console.log('ERROR OUTPUT:')
  console.log(e.stderr || '')
}
