/**
 * useSmartImport — 智能导入建议 Hook
 *
 * 分析代码中可能未定义的标识符，根据常见库模式建议 import 语句。
 * 纯前端分析，无需调用 AI API。
 */

import { useMemo } from 'react'

export interface ImportSuggestion {
  id: string
  symbol: string
  /** 建议的 import 语句 */
  importStatement: string
  /** 置信度: high | medium | low */
  confidence: 'high' | 'medium' | 'low'
  /** 出现行号 */
  line: number
}

interface UseSmartImportOptions {
  filePath?: string
  content?: string
  enabled?: boolean
}

// 常见库的导出符号映射（简化版）
const LIBRARY_SYMBOLS: Record<string, string[]> = {
  'react': ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'forwardRef', 'memo', 'lazy', 'Suspense', 'createElement', 'Fragment', 'createContext', 'createRef'],
  'react-dom': ['render', 'hydrate', 'createPortal', 'unmountComponentAtNode', 'findDOMNode'],
  'react-router-dom': ['BrowserRouter', 'HashRouter', 'Link', 'NavLink', 'Route', 'Routes', 'Navigate', 'useNavigate', 'useParams', 'useLocation', 'useMatch', 'Outlet', 'useSearchParams'],
  'react-redux': ['useSelector', 'useDispatch', 'connect', 'Provider'],
  '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createAsyncThunk', 'createAction', 'createSelector', 'combineReducers'],
  'zustand': ['create'],
  'axios': ['default', 'get', 'post', 'put', 'delete', 'patch', 'create', 'AxiosResponse', 'AxiosError'],
  'lodash': ['debounce', 'throttle', 'cloneDeep', 'merge', 'pick', 'omit', 'get', 'set', 'isEqual', 'isEmpty', 'isNil', 'uniq', 'groupBy', 'sortBy', 'chunk', 'flatten', 'compact', 'uniqBy'],
  'date-fns': ['format', 'parse', 'addDays', 'subDays', 'addMonths', 'subMonths', 'startOfDay', 'endOfDay', 'isAfter', 'isBefore', 'isEqual', 'differenceInDays', 'distanceInWords', 'formatDistance'],
  'clsx': ['default'],
  'tailwind-merge': ['twMerge'],
  'uuid': ['v4', 'v1', 'validate'],
  'zod': ['z', 'ZodSchema', 'ZodString', 'ZodNumber', 'ZodBoolean', 'ZodObject', 'ZodArray', 'ZodEnum', 'ZodUnion', 'ZodOptional', 'ZodNullable', 'ZodDefault', 'object', 'string', 'number', 'boolean', 'array', 'enum', 'union', 'optional', 'nullable', 'default'],
  'class-variance-authority': ['cva'],
  'lucide-react': ['IconName'], // 简化：匹配任何 IconXxx 模式
  '@mui/material': ['Button', 'TextField', 'Select', 'MenuItem', 'Dialog', 'DialogTitle', 'DialogContent', 'DialogActions', 'AppBar', 'Toolbar', 'Typography', 'Box', 'Grid', 'Card', 'CardContent', 'Paper', 'IconButton'],
  'electron': ['app', 'BrowserWindow', 'ipcMain', 'ipcRenderer', 'dialog', 'shell', 'clipboard', 'screen', 'nativeImage', 'Menu', 'MenuItem', 'Tray', 'globalShortcut', 'powerMonitor', 'powerSaveBlocker', 'session', 'protocol', 'net', 'crashReporter', 'autoUpdater'],
}

const EXTENSION_TO_LIBS: Record<string, string[]> = {
  'tsx': ['react', 'react-dom', 'react-router-dom', 'react-redux', '@reduxjs/toolkit', 'clsx', 'tailwind-merge', 'lucide-react'],
  'ts': ['react', 'lodash', 'date-fns', 'uuid', 'zod', 'electron'],
  'jsx': ['react', 'react-dom', 'react-router-dom', 'clsx', 'tailwind-merge'],
  'js': ['lodash', 'axios', 'uuid'],
  'py': [], // Python 的导入暂不处理
  'rs': [], // Rust 的导入暂不处理
}

export function useSmartImport(options: UseSmartImportOptions = {}): ImportSuggestion[] {
  const { content = '', filePath = '', enabled = true } = options

  return useMemo(() => {
    if (!enabled || !content) return []

    const suggestions: ImportSuggestion[] = []
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const candidateLibs = EXTENSION_TO_LIBS[ext] || ['react', 'lodash', 'axios']
    const lines = content.split('\n')

    // 收集已有的 import
    const existingImports = new Set<string>()
    const importRegex = /^import\s+.*?from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = importRegex.exec(content)) !== null) {
      const libName = match[1]
      existingImports.add(libName)
      // 也检查具名导入
      const namedRegex = /import\s+\{([^}]+)\}\s+from/
      const namedMatch = content.slice(Math.max(0, match.index - 100), match.index + 200).match(namedRegex)
      if (namedMatch) {
        const symbols = namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim())
        symbols.forEach(s => existingImports.add(`${libName}:${s}`))
      }
    }

    // 检测未定义的标识符
    for (const libName of candidateLibs) {
      if (existingImports.has(libName)) continue // 已导入整个库

      const symbols = LIBRARY_SYMBOLS[libName] || []
      for (const symbol of symbols) {
        // 跳过已在 import 中的符号
        if (existingImports.has(`${libName}:${symbol}`)) continue
        if (existingImports.has(symbol)) continue // 可能从其他库导入

        // 搜索代码中使用该符号的地方
        const usageRegex = new RegExp(`\\b${symbol}\\b`, 'g')
        const usages: number[] = []
        lines.forEach((line, i) => {
          // 跳过注释行和 import 行
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('import ')) return
          if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return
          if (usageRegex.test(line)) {
            usages.push(i + 1)
          }
        })

        if (usages.length > 0) {
          const isDefault = libName.endsWith('/index') || ['clsx', 'uuid'].includes(libName.split('/')[0])
          const importStatement = isDefault
            ? `import ${symbol === 'default' ? '' : symbol} from '${libName}'`
            : `import { ${symbol} } from '${libName}'`

          suggestions.push({
            id: `import-${libName}-${symbol}`,
            symbol,
            importStatement,
            confidence: usages.length >= 3 ? 'high' : usages.length >= 1 ? 'medium' : 'low',
            line: usages[0],
          })
        }
      }
    }

    // 限制建议数量
    return suggestions.slice(0, 15)
  }, [content, filePath, enabled])
}
