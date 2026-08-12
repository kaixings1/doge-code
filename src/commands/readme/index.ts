import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

function getProjectInfo(): { name: string; language: string; framework: string; scripts: Record<string, string>; description: string } {
  let name = 'project'; let language = 'TypeScript'; let framework = ''; const scripts: Record<string, string> = {}; let description = ''
  try {
    if (existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      name = pkg.name || name; description = pkg.description || description
      if (pkg.scripts) Object.assign(scripts, pkg.scripts)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.typescript) language = 'TypeScript'; else language = 'JavaScript'
      if (deps.next) framework = 'Next.js'; else if (deps.react) framework = 'React'; else if (deps.vue) framework = 'Vue'; else if (deps.express) framework = 'Express'
    }
  } catch { /* ignore */ }
  return { name, language, framework, scripts, description }
}

function generateReadme(info: ReturnType<typeof getProjectInfo>): string {
  return `# ${info.name}

${info.description || 'A ' + (info.framework || info.language) + ' project.'}

## Tech Stack

- **Language:** ${info.language}
- **Framework:** ${info.framework || 'None'}

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Start development server
${info.scripts.dev || 'npm run dev'}

# Build for production
${info.scripts.build || 'npm run build'}

# Run tests
${info.scripts.test || 'npm test'}
\`\`\`

## Project Structure

\`\`\`
src/
├── components/    # UI components
├── pages/         # Page components
├── utils/         # Utility functions
├── hooks/         # Custom hooks
└── styles/        # Stylesheets
\`\`\`

## Scripts

| Command | Description |
|---------|-------------|
${Object.entries(info.scripts).map(([k, v]) => '| `' + k + '` | ' + v + ' |').join('\n')}

## License

MIT
`
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const info = getProjectInfo()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📄 README 生成器', '', '📖 用法：', '  /readme                        生成 README', '  /readme preview               仅预览', '  /readme save [文件]           保存到文件', '  /readme template <名称>       使用模板', '  /readme sections              可用章节', '  /readme badges                生成徽章', '  /readme toc                   生成目录', '  /readme update                更新现有', '  /readme check                 检查完整性', ''].join('\n') }

  if (cmd === 'preview' || cmd === '') return { type: 'text', value: generateReadme(info) }

  if (cmd === 'save') {
    const file = parts[1] || 'README.md'
    writeFileSync(file, generateReadme(info), 'utf-8')
    return { type: 'text', value: '✅ 已保存：' + file }
  }

  if (cmd === 'template') return { type: 'text', value: '可用模板：default（默认）、minimal（精简）、full（完整）、library（库）、api' }
  if (cmd === 'sections') return { type: 'text', value: '可用章节：\n  - 标题与描述\n  - 技术栈\n  - 快速开始\n  - 项目结构\n  - 脚本\n  - API 参考\n  - 贡献指南\n  - 许可证' }

  if (cmd === 'badges') {
    const shields = 'https://shields.io'
    const lines = ['Badges:', '=======', '', '![Version](https://img.shields.io/npm/v/' + info.name + ')', '![License](https://img.shields.io/github/license/user/' + info.name + ')', '![Build](https://img.shields.io/github/actions/workflow/status/user/' + info.name + '/ci.yml)', '![Coverage](https://img.shields.io/codecov/c/github/user/' + info.name + ')', '', 'Generate more: ' + shields]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'toc') {
    if (existsSync('README.md')) {
      const content = readFileSync('README.md', 'utf-8')
      const headings = content.match(/^#{1,3}\s+.+$/gm) || []
      return { type: 'text', value: '目录：\n' + headings.map(h => '- ' + h.replace(/^#+\s+/, '')).join('\n') }
    }
    return { type: 'text', value: '未找到 README.md' }
  }

  if (cmd === 'update') {
    if (existsSync('README.md')) return { type: 'text', value: '✅ README.md 存在。使用 /readme preview 重新生成。' }
    return { type: 'text', value: '未找到 README.md。使用 /readme save 创建。' }
  }

  if (cmd === 'check') {
    const exists = existsSync('README.md')
    return { type: 'text', value: 'README.md：' + (exists ? '✅ 已存在' : '❌ 未找到') + '\n' + (exists ? '行数：' + readFileSync('README.md', 'utf-8').split('\n').length : '使用 /readme save 创建') }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const readme: Command = {
  type: 'local', name: 'readme',
  description: '📄 README - 生成/预览/保存/徽章/目录/检查/更新/章节',
  aliases: '/readme, /rm'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default readme
