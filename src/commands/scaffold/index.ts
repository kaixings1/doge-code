import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

/**
 * /scaffold 命令 - 项目脚手架工具
 * 快速创建常见项目结构
 */

const HELP_TEXT = `🏗️ **Scaffold 命令** - 项目脚手架工具

**用法**: /scaffold <类型> [项目名] [选项]

**类型**:
  node          - Node.js 项目 (TypeScript)
  react         - React + TypeScript 项目
  next          - Next.js 项目
  bun           - Bun 项目模板
  vue           - Vue 3 + TypeScript 项目
  python        - Python 项目
  rust          - Rust 项目
  go            - Go 模块项目

**选项**:
  --deps        - 安装依赖
  --git         - 初始化 Git 仓库
  --help        - 显示帮助

**示例**:
  /scaffold node my-app --deps --git    # 创建 Node.js 项目并安装依赖
  /scaffold react frontend --deps         # 创建 React 项目`

// Node.js 项目模板
function createNodeProject(name: string, cwd: string): string {
  const targetDir = join(cwd, name)

  if (existsSync(targetDir)) {
    return `❌ 目录已存在: ${targetDir}`
  }

  mkdirSync(targetDir, { recursive: true })
  mkdirSync(join(targetDir, 'src'), { recursive: true })
  mkdirSync(join(targetDir, 'dist'), { recursive: true })

  // package.json
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'bun run src/index.ts',
      build: 'bun build src/index.ts --outdir dist',
      start: 'bun run dist/index.js',
    },
    devDependencies: {
      '@types/bun': 'latest',
      typescript: 'latest',
    },
  }, null, 2))

  // tsconfig.json
  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    exclude: ['node_modules'],
  }, null, 2))

  // src/index.ts
  writeFileSync(join(targetDir, 'src', 'index.ts'), `console.log('Hello from ${name}!')\n`)

  // README.md
  writeFileSync(join(targetDir, 'README.md'), `# ${name}

A Bun + TypeScript project.

## Development
\`\`\`bash
bun install
bun run dev
\`\`\`

## Build
\`\`\`bash
bun run build
\`\`\`
`)

  return `✅ **Node.js 项目已创建**

📁 项目结构:
• \`${name}/\`
  ├─ package.json
  ├─ tsconfig.json
  ├─ README.md
  └─ src/index.ts

💡 使用 \`cd ${name} && bun install\` 安装依赖`
}

// React 项目模板
function createReactProject(name: string, cwd: string): string {
  const targetDir = join(cwd, name)

  if (existsSync(targetDir)) {
    return `❌ 目录已存在: ${targetDir}`
  }

  mkdirSync(targetDir, { recursive: true })
  mkdirSync(join(targetDir, 'src'), { recursive: true })
  mkdirSync(join(targetDir, 'public'), { recursive: true })

  // package.json
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'bun run dev',
      build: 'bun run build',
      preview: 'bun run preview',
    },
    dependencies: {},
    devDependencies: {
      '@types/react': 'latest',
      '@types/react-dom': 'latest',
      react: 'latest',
      'react-dom': 'latest',
      typescript: 'latest',
      vite: 'latest',
    },
  }, null, 2))

  // tsconfig.json
  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      jsx: 'react-jsx',
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src'],
  }, null, 2))

  // vite.config.ts
  writeFileSync(join(targetDir, 'vite.config.ts'), `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`)

  // src/main.tsx
  writeFileSync(join(targetDir, 'src', 'main.tsx'), `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`)

  // src/App.tsx
  writeFileSync(join(targetDir, 'src', 'App.tsx'), `import React from 'react'

export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Welcome to ${name}!</h1>
      <p>A React + TypeScript project.</p>
    </div>
  )
}
`)

  // src/index.css
  writeFileSync(join(targetDir, 'src', 'index.css'), `body {
  margin: 0;
  font-family: system-ui, sans-serif;
}`)

  // public/index.html
  writeFileSync(join(targetDir, 'public', 'index.html'), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`)

  return `✅ **React 项目已创建**

📁 项目结构:
• \`${name}/\`
  ├─ package.json
  ├─ tsconfig.json
  ├─ vite.config.ts
  ├─ public/index.html
  └─ src/
     ├─ main.tsx
     ├─ App.tsx
     └─ index.css

💡 使用 \`cd ${name} && bun install && bun run dev\` 启动开发服务器`
}

// Next.js 项目模板
function createNextProject(name: string, cwd: string): string {
  const targetDir = join(cwd, name)

  if (existsSync(targetDir)) {
    return `❌ 目录已存在: ${targetDir}`
  }

  mkdirSync(targetDir, { recursive: true })

  // package.json
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      next: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      typescript: 'latest',
    },
  }, null, 2))

  // next.config.mjs
  writeFileSync(join(targetDir, 'next.config.mjs'), `/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    appDir: true,
  },
}

export default config
`)

  // tsconfig.json
  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      jsx: 'preserve',
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }, null, 2))

  // app/layout.tsx
  mkdirSync(join(targetDir, 'app'), { recursive: true })
  writeFileSync(join(targetDir, 'app', 'layout.tsx'), `import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '${name}',
  description: 'Generated by doge scaffold',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`)

  // app/page.tsx
  writeFileSync(join(targetDir, 'app', 'page.tsx'), `export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Welcome to ${name}!</h1>
      <p>A Next.js project.</p>
    </main>
  )
}
`)

  // app/globals.css
  writeFileSync(join(targetDir, 'app', 'globals.css'), `body {
  margin: 0;
  font-family: system-ui, sans-serif;
}`)

  return `✅ **Next.js 项目已创建**

📁 项目结构:
• \`${name}/\`
  ├─ package.json
  ├─ next.config.mjs
  ├─ tsconfig.json
  └─ app/
     ├─ layout.tsx
     ├─ page.tsx
     └─ globals.css

💡 使用 \`cd ${name} && bun install && bun run dev\` 启动开发服务器`
}

// Bun 项目模板
function createBunProject(name: string, cwd: string): string {
  const targetDir = join(cwd, name)

  if (existsSync(targetDir)) {
    return `❌ 目录已存在: ${targetDir}`
  }

  mkdirSync(targetDir, { recursive: true })

  // package.json for Bun
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: `bun run index.ts`,
      start: `bun run index.ts`,
    },
  }, null, 2))

  // index.ts
  writeFileSync(join(targetDir, 'index.ts'), `console.log('Hello from ${name}!')

// Bun 内置 API 示例
// const server = Bun.serve({
//   port: 3000,
//   fetch() {
//     return new Response('Hello World')
//   },
// })
// console.log('Server running on http://localhost:3000')
`)

  // tsconfig.json
  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
    },
  }, null, 2))

  return `✅ **Bun 项目已创建**

📁 项目结构:
• \`${name}/\`
  ├─ package.json
  ├─ tsconfig.json
  └─ index.ts

💡 使用 \`cd ${name} && bun run dev\` 运行项目`
}

export const call: LocalCommandCall = async (args, context) => {
  const s = (args ?? '').trim().toLowerCase()
  const words = s.split(/\s+/)
  const command = words[0] || 'help'
  const projectName = words[1] || 'my-project'
  const cwd = context?.cwd || process.cwd()

  if (command === 'help' || s === '') {
    return { type: 'text', value: HELP_TEXT }
  }

  const projectTypes = ['node', 'react', 'next', 'bun', 'vue', 'python', 'rust', 'go']

  if (!projectTypes.includes(command)) {
    return {
      type: 'text',
      value: `❌ **未知项目类型**: \`${command}\`

${HELP_TEXT}`
    }
  }

  try {
    let result: string

    switch (command) {
      case 'node':
        result = createNodeProject(projectName, cwd)
        break
      case 'react':
        result = createReactProject(projectName, cwd)
        break
      case 'next':
        result = createNextProject(projectName, cwd)
        break
      case 'bun':
        result = createBunProject(projectName, cwd)
        break
      case 'vue':
      case 'python':
      case 'rust':
      case 'go':
        result = `🔨 **${command} 模板开发中**

此项目类型正在开发中，敬请期待！`
        break
    }

    // 处理 --deps 选项
    if (s.includes('--deps') && !result.includes('开发中')) {
      result += `\n\n📦 提示: 请手动运行依赖安装命令`
    }

    // 处理 --git 选项
    if (s.includes('--git') && !result.includes('开发中')) {
      result += `\n🌐 提示: 请手动运行 \`git init\` 初始化仓库`
    }

    return { type: 'text', value: result }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ **创建失败**

${err instanceof Error ? err.message : String(err)}`
    }
  }
}

const scaffold: Command = {
  type: 'local',
  name: 'scaffold',
  description: '项目脚手架工具 - 快速创建 Node.js/React/Next.js/Bun 项目',
  aliases: ['init-project'],
  isEnabled: () => {
    const { getIsNonInteractiveSession } = require('../../bootstrap/state.js')
    return !getIsNonInteractiveSession()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default scaffold
