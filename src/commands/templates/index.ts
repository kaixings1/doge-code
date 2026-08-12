import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

interface ProjectTemplate {
  name: string
  description: string
  category: 'frontend' | 'backend' | 'fullstack' | 'cli' | 'library' | 'mobile'
  commands: string[]
  files: { path: string; content: string }[]
}

const TEMPLATES: ProjectTemplate[] = [
  {
    name: 'react-ts',
    description: 'React + TypeScript + Vite starter',
    category: 'frontend',
    commands: ['npm create vite@latest . -- --template react-ts'],
    files: [],
  },
  {
    name: 'nextjs',
    description: 'Next.js 14 + TypeScript + Tailwind',
    category: 'fullstack',
    commands: ['npx create-next-app@latest . --typescript --tailwind --eslint --app'],
    files: [],
  },
  {
    name: 'node-api',
    description: 'Node.js + Express + TypeScript REST API',
    category: 'backend',
    commands: [],
    files: [
      { path: 'src/index.ts', content: 'import express from "express";\n\nconst app = express();\nconst port = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get("/health", (req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(port, () => {\n  console.log(`Server running on port ${port}`);\n});\n' },
      { path: 'tsconfig.json', content: '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "commonjs",\n    "strict": true,\n    "outDir": "./dist",\n    "rootDir": "./src",\n    "esModuleInterop": true\n  },\n  "include": ["src/**/*"]\n}\n' },
      { path: '.gitignore', content: 'node_modules/\ndist/\n.env\n*.log\n' },
    ],
  },
  {
    name: 'cli-tool',
    description: 'TypeScript CLI tool with Bun',
    category: 'cli',
    commands: [],
    files: [
      { path: 'src/cli.ts', content: '#!/usr/bin/env bun\n\nconst args = process.argv.slice(2);\n\nif (args.length === 0) {\n  console.log("Usage: my-cli <command>");\n  console.log("Commands: hello, help");\n  process.exit(0);\n}\n\nconst command = args[0];\n\nswitch (command) {\n  case "hello":\n    console.log("Hello, World!");\n    break;\n  case "help":\n    console.log("Available commands: hello, help");\n    break;\n  default:\n    console.log(`Unknown command: ${command}`);\n    process.exit(1);\n}\n' },
      { path: 'package.json', content: '{\n  "name": "my-cli",\n  "version": "1.0.0",\n  "bin": {\n    "my-cli": "./src/cli.ts"\n  },\n  "scripts": {\n    "dev": "bun run src/cli.ts",\n    "build": "bun build src/cli.ts --compile --outfile my-cli"\n  }\n}\n' },
    ],
  },
  {
    name: 'python-api',
    description: 'Python + FastAPI REST API',
    category: 'backend',
    commands: [],
    files: [
      { path: 'main.py', content: 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run(app, host="0.0.0.0", port=8000)\n' },
      { path: 'requirements.txt', content: 'fastapi\nuvicorn\npydantic\n' },
    ],
  },
]

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const lines = ['Project Templates:', '==================', '']
    const categories = ['frontend', 'backend', 'fullstack', 'cli', 'library', 'mobile']
    for (const cat of categories) {
      const templates = TEMPLATES.filter(t => t.category === cat)
      if (templates.length > 0) {
        lines.push(cat.toUpperCase() + ':')
        templates.forEach(t => {
          lines.push('  ' + t.name + ' - ' + t.description)
        })
        lines.push('')
      }
    }
    lines.push('Usage: /templates use <name> [directory]')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'use' || cmd === 'create') {
    const name = parts[1]
    const dir = parts[2] || '.'
    if (!name) return { type: 'text', value: 'Usage: /templates use <name> [directory]' }

    const template = TEMPLATES.find(t => t.name === name)
    if (!template) return { type: 'text', value: 'Template not found: ' + name + '\nUse /templates list to see available templates.' }

    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      for (const file of template.files) {
        const filePath = join(dir, file.path)
        const fileDir = filePath.slice(0, filePath.lastIndexOf('/'))
        if (fileDir && !existsSync(fileDir)) mkdirSync(fileDir, { recursive: true })
        writeFileSync(filePath, file.content, 'utf-8')
      }

      for (const command of template.commands) {
        try {
          execSync(command, { cwd: dir, stdio: 'inherit' })
        } catch { /* ignore command errors */ }
      }

      return {
        type: 'text',
        value: [
          '[OK] Created project from template: ' + template.name,
          '',
          'Files created:',
          ...template.files.map(f => '  - ' + f.path),
          '',
          'Next steps:',
          '  cd ' + (dir === '.' ? template.name : dir),
          '  bun install',
          '  bun run dev',
        ].join('\n'),
      }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: 'Usage: /templates search <query>' }
    const results = TEMPLATES.filter(t =>
      t.name.includes(query) || t.description.toLowerCase().includes(query) || t.category.includes(query)
    )
    if (results.length === 0) return { type: 'text', value: 'No templates found for: ' + query }
    const lines = ['Search Results:', '================', '']
    results.forEach(t => lines.push(t.name + ' - ' + t.description + ' [' + t.category + ']'))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: [
    'Project Templates',
    '',
    '📖 Usage: ',
    '  /templates list             List all templates',
    '  /templates use <name> [dir] Create project from template',
    '  /templates search <query>   Search templates',
    '',
    'Categories: frontend, backend, fullstack, cli, library, mobile',
  ].join('\n') }
}

const templates: Command = {
  type: 'local',
  name: 'templates',
  description: 'Project templates - scaffold new projects from templates',
  aliases: ['/templates', '/tmpl', '/scaffold'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default templates
