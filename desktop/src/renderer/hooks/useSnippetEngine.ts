import { useState, useCallback, useMemo } from 'react'
import { SnippetTemplateEngine } from '../utils/SnippetTemplateEngine.js'

export interface TemplateSnippet {
  id: string
  name: string
  description: string
  language: string
  template: string
  category: string
}

export interface TabStopField {
  tabStop: ReturnType<typeof SnippetTemplateEngine.getTabStops>[0]
  value: string
}

export interface UseSnippetEngineResult {
  snippets: TemplateSnippet[]
  selectedSnippet: TemplateSnippet | null
  preview: string
  fields: TabStopField[]
  activeFieldIndex: number
  selectSnippet: (snippet: TemplateSnippet) => void
  updateField: (index: number, value: string) => void
  nextField: () => void
  prevField: () => void
  renderPreview: () => void
  resetFields: () => void
}

const DEFAULT_SNIPPETS: TemplateSnippet[] = [
  {
    id: 'react-component',
    name: 'React Functional Component',
    description: 'TSX 函数组件模板',
    language: 'typescript',
    category: 'React',
    template: `import React from 'react'

interface {{ComponentName}}Props {
  {{props}}
}

export function {{ComponentName}}({ }: {{ComponentName}}Props) {
  return (
    <div>
      {/* TODO */}
    </div>
  )
}`,
  },
  {
    id: 'async-fn',
    name: 'Async Function',
    description: '异步函数模板',
    language: 'typescript',
    category: 'TypeScript',
    template: `async function {{functionName}}({{params}}): Promise<{{returnType}}> {
  try {
    // TODO
  } catch (error) {
    console.error('{{functionName}} failed:', error)
    throw error
  }
}`,
  },
  {
    id: 'try-catch',
    name: 'Try-Catch Block',
    description: '异常处理块',
    language: 'typescript',
    category: 'Pattern',
    template: `try {
  {{code}}
} catch (error) {
  console.error('{{errorMessage}}:', error)
}`,
  },
  {
    id: 'express-route',
    name: 'Express Route',
    description: 'Express 路由模板',
    language: 'typescript',
    category: 'Node.js',
    template: `app.{{method}}('{{path}}', async (req, res) => {
  try {
    const {{resultVar}} = await {{serviceCall}}
    res.json({ {{resultVar}} })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})`,
  },
  {
    id: 'python-class',
    name: 'Python Class',
    description: 'Python 类模板',
    language: 'python',
    category: 'Python',
    template: `class {{ClassName}}:
    def __init__(self, {{params}}):
        self.{{param}} = {{param}}

    def {{method}}(self):
        pass`,
  },
]

export function useSnippetEngine(): UseSnippetEngineResult {
  const [snippets] = useState<TemplateSnippet[]>(DEFAULT_SNIPPETS)
  const [selectedSnippet, setSelectedSnippet] = useState<TemplateSnippet | null>(null)
  const [fields, setFields] = useState<TabStopField[]>([])
  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const [preview, setPreview] = useState('')

  const selectSnippet = useCallback((snippet: TemplateSnippet) => {
    setSelectedSnippet(snippet)
    const stops = SnippetTemplateEngine.getTabStops(snippet.template)
    setFields(stops.map(s => ({ tabStop: s, value: s.defaultValue })))
    setActiveFieldIndex(0)
    updatePreview(snippet.template, stops)
  }, [])

  const updateField = useCallback((index: number, value: string) => {
    setFields(prev => {
      const next = [...prev]
      if (index < next.length) {
        next[index] = { ...next[index], value }
      }
      return next
    })
    if (selectedSnippet) {
      renderFromFields(selectedSnippet.template, [...fields])
    }
  }, [selectedSnippet, fields])

  const nextField = useCallback(() => {
    setActiveFieldIndex(prev => Math.min(prev + 1, fields.length - 1))
  }, [fields.length])

  const prevField = useCallback(() => {
    setActiveFieldIndex(prev => Math.max(prev - 1, 0))
  }, [])

  const updatePreview = useCallback((template: string, stops: ReturnType<typeof SnippetTemplateEngine.getTabStops>) => {
    let text = template
    stops.forEach(stop => {
      const re = new RegExp(`\\$\\{${stop.index}(?::([^}|]*)(?:\\|[^}]+)?)?\\}`, 'g')
      text = text.replace(re, stop.defaultValue || stop.placeholder || '')
    })
    setPreview(text)
  }, [])

  const renderFromFields = useCallback((template: string, currentFields: TabStopField[]) => {
    let text = template
    currentFields.forEach(f => {
      const re = new RegExp(`\\$\\{${f.tabStop.index}(?::([^}|]*)(?:\\|[^}]+)?)?\\}`, 'g')
      text = text.replace(re, f.value)
    })
    setPreview(text)
  }, [])

  const renderPreview = useCallback(() => {
    if (selectedSnippet) {
      renderFromFields(selectedSnippet.template, fields)
    }
  }, [selectedSnippet, fields, renderFromFields])

  const resetFields = useCallback(() => {
    if (selectedSnippet) {
      const stops = SnippetTemplateEngine.getTabStops(selectedSnippet.template)
      setFields(stops.map(s => ({ tabStop: s, value: s.defaultValue })))
      setActiveFieldIndex(0)
      updatePreview(selectedSnippet.template, stops)
    }
  }, [selectedSnippet, updatePreview])

  return {
    snippets,
    selectedSnippet,
    preview,
    fields,
    activeFieldIndex,
    selectSnippet,
    updateField,
    nextField,
    prevField,
    renderPreview,
    resetFields,
  }
}
