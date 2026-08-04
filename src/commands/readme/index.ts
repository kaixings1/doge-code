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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['README Generator', '', 'Usage:', '  /readme                         Generate README', '  /readme preview                Preview only', '  /readme save [file]            Save to file', '  /readme template <name>        Use template', '  /readme sections               Available sections', '  /readme badges                 Generate badges', '  /readme toc                    Generate TOC', '  /readme update                 Update existing', '  /readme check                  Check completeness', ''].join('\n') }

  if (cmd === 'preview' || cmd === '') return { type: 'text', value: generateReadme(info) }

  if (cmd === 'save') {
    const file = parts[1] || 'README.md'
    writeFileSync(file, generateReadme(info), 'utf-8')
    return { type: 'text', value: '[OK] Saved: ' + file }
  }

  if (cmd === 'template') return { type: 'text', value: 'Available templates: default, minimal, full, library, api' }
  if (cmd === 'sections') return { type: 'text', value: 'Available sections:\n  - Title & Description\n  - Tech Stack\n  - Getting Started\n  - Project Structure\n  - Scripts\n  - API Reference\n  - Contributing\n  - License' }

  if (cmd === 'badges') {
    const shields = 'https://shields.io'
    const lines = ['Badges:', '=======', '', '![Version](https://img.shields.io/npm/v/' + info.name + ')', '![License](https://img.shields.io/github/license/user/' + info.name + ')', '![Build](https://img.shields.io/github/actions/workflow/status/user/' + info.name + '/ci.yml)', '![Coverage](https://img.shields.io/codecov/c/github/user/' + info.name + ')', '', 'Generate more: ' + shields]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'toc') {
    if (existsSync('README.md')) {
      const content = readFileSync('README.md', 'utf-8')
      const headings = content.match(/^#{1,3}\s+.+$/gm) || []
      return { type: 'text', value: 'Table of Contents:\n' + headings.map(h => '- ' + h.replace(/^#+\s+/, '')).join('\n') }
    }
    return { type: 'text', value: 'No README.md found' }
  }

  if (cmd === 'update') {
    if (existsSync('README.md')) return { type: 'text', value: '[OK] README.md exists. Use /readme preview to regenerate.' }
    return { type: 'text', value: 'No README.md found. Use /readme save to create.' }
  }

  if (cmd === 'check') {
    const exists = existsSync('README.md')
    return { type: 'text', value: 'README.md: ' + (exists ? '[OK] exists' : '[MISSING] not found') + '\n' + (exists ? 'Lines: ' + readFileSync('README.md', 'utf-8').split('\n').length : 'Create with /readme save') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const readme: Command = {
  type: 'local', name: 'readme',
  description: 'README - generate/preview/save/badges/toc/check/update/sections',
  aliases: '/readme, /rm'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default readme
