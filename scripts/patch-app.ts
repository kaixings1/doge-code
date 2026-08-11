import { readFileSync, writeFileSync } from 'fs'

const filePath = 'D:/doge-code/desktop/src/renderer/App.tsx'
let content = readFileSync(filePath, 'utf-8')

// 1. Add imports after existing imports
const importMarker = "import { getStyles, getEffectiveTheme, THEMES, type ThemeName, type ThemeColors } from './theme.js'"
const newImports = `${importMarker}
import { AdvancedCodeEditor } from './components/AdvancedCodeEditor.js'
import { SemanticSearchPanel } from './components/SemanticSearchPanel.js'
import { AICodeReviewPanel } from './components/AICodeReviewPanel.js'
import { OutlinePanel } from './components/OutlinePanel.js'`

if (!content.includes('AdvancedCodeEditor')) {
  content = content.replace(importMarker, newImports)
}

// 2. Add state variables after showPluginPanel
const stateMarker = 'const [showPluginPanel, setShowPluginPanel] = useState(false)'
const newState = `${stateMarker}
  const [showSemanticSearch, setShowSemanticSearch] = useState(false)
  const [showAIOutline, setShowAIOutline] = useState(false)
  const [showCodeReview, setShowCodeReview] = useState(false)
  const [activeReviewFile, setActiveReviewFile] = useState<string | null>(null)`

if (!content.includes('showSemanticSearch')) {
  content = content.replace(stateMarker, newState)
}

// 3. Add keyboard shortcuts before the closing bracket of the switch statement
const shortcutMarker = "case '`': e.preventDefault(); setTerminalVisible(p => !p); break"
const newShortcuts = `${shortcutMarker}
        case 's': e.preventDefault(); setShowSemanticSearch(p => !p); break
        case 'o': e.preventDefault(); setShowAIOutline(p => !p); break
        case 'e': e.preventDefault(); setShowCodeReview(p => !p); break`

if (!content.includes("case 's':")) {
  content = content.replace(shortcutMarker, newShortcuts)
}

// 4. Add panel rendering before showShortcuts
const panelMarker = '{showCommandPalette && <CommandPalette'
const newPanels = `{showSemanticSearch && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 360, height: '70%', zIndex: 9990, background: c.bgPanel, border: \`1px solid \${c.border}\`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <SemanticSearchPanel cwd={workingDir} theme={theme} onResultClick={(filePath, line) => { handlePreviewFile(filePath) }} />
          </div>
        )}
        {showAIOutline && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 320, height: '70%', zIndex: 9990, background: c.bgPanel, border: \`1px solid \${c.border}\`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <OutlinePanel filePath={activePreviewFile.path} cwd={workingDir} theme={theme} onSymbolClick={(filePath, line) => { handlePreviewFile(filePath) }} />
          </div>
        )}
        {showCodeReview && activePreviewFile && (
          <div style={{ position: 'fixed', top: 60, right: 300, width: 380, height: '70%', zIndex: 9990, background: c.bgPanel, border: \`1px solid \${c.border}\`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <AICodeReviewPanel filePath={activePreviewFile.path} cwd={workingDir} theme={theme} onNavigateTo={(filePath, line) => { handlePreviewFile(filePath) }} />
          </div>
        )}
        ${panelMarker}`

if (!content.includes('showSemanticSearch && activePreviewFile')) {
  content = content.replace(panelMarker, newPanels)
}

writeFileSync(filePath, content)
console.log('App.tsx patched successfully')
