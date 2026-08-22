import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { WebBrowserTool } from '../../tools/WebBrowserTool/WebBrowserTool.js'
import { ImageDisplay } from '../../components/ImageDisplay.js'

// ============================================================================
// Browser 交互式浏览器命令 - 类似 Cline 的网页浏览能力
// ============================================================================

type NavEntry = { url: string; title: string; timestamp: number }
type Mode = 'navigate' | 'history' | 'content'

const MAX_HISTORY = 20

function getBrowserTool(): WebBrowserTool {
  return new WebBrowserTool()
}

export const call: LocalJSXCommandCall = async (_onDone, context, _args) => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `browser — Interactive web browser (navigate URLs, take screenshots, interact with pages)\n用法: /browser`.trim(), truncated: false }
  }
  const [, setRefresh] = React.useState(0)
  const [mode, setMode] = React.useState<Mode>('navigate')
  const [url, setUrl] = React.useState('')
  const [status, setStatus] = React.useState('Ready')
  const [history, setHistory] = React.useState<NavEntry[]>([])
  const [pageTitle, setPageTitle] = React.useState('')
  const [lastScreenshot, setLastScreenshot] = React.useState<string | null>(null)
  const [showScreenshot, setShowScreenshot] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const tool = getBrowserTool()

  const navigateTo = async (targetUrl: string) => {
    setStatus('Navigating...')
    setError(null)

    let navUrl = targetUrl
    if (!navUrl.startsWith('http://') && !navUrl.startsWith('https://')) {
      navUrl = 'https://' + navUrl
    }

    const result = await tool.execute({ action: 'navigate', url: navUrl })

    const text = result.content.find(c => c.type === 'text')?.text || ''
    if (text.includes('Error') || text.includes('error')) {
      setError(text)
      setStatus('Navigation failed')
    } else {
      setError(null)
      setStatus('Ready')
      const titleMatch = text.match(/Page title: (.+)/)
      if (titleMatch) setPageTitle(titleMatch[1])

      setHistory(h => {
        const updated = [...h, { url: navUrl, title: titleMatch?.[1] || navUrl, timestamp: Date.now() }]
        return updated.slice(-MAX_HISTORY)
      })
      setUrl('')
    }
    setRefresh(k => k + 1)
  }

  const takeScreenshot = async () => {
    setStatus('Capturing screenshot...')
    setError(null)

    const result = await tool.execute({ action: 'screenshot' })

    const imageContent = result.content.find(c => c.type === 'image')
    if (imageContent && imageContent.source) {
      const base64Data = imageContent.source.data as string
      setLastScreenshot(base64Data)
      setShowScreenshot(true)

      const textContent = result.content.find(c => c.type === 'text')?.text || ''
      setStatus(textContent)
    } else {
      const text = result.content.find(c => c.type === 'text')?.text || ''
      setError(text)
      setStatus('Screenshot failed')
    }
    setRefresh(k => k + 1)
  }

  const getPageContent = async () => {
    setStatus('Getting page content...')
    setError(null)

    const result = await tool.execute({ action: 'getContent' })
    const text = result.content.find(c => c.type === 'text')?.text || ''
    if (text.includes('Error') || text.includes('error')) {
      setError(text)
      setStatus('Failed')
    } else {
      setError(null)
      setStatus(`Got ${text.length} chars`)
    }
    setRefresh(k => k + 1)
  }

  useInput(async (input, key) => {
    if (key.escape) {
      await tool.execute({ action: 'close' })
      _onDone()
      return
    }

    // Navigation mode (default)
    if (mode === 'navigate') {
      if (key.ctrl && input === 'd') {
        await tool.execute({ action: 'close' })
        _onDone()
        return
      }
      if (key.ctrl && input === 'l') {
        setShowScreenshot(false)
        setRefresh(k => k + 1)
        return
      }
      if (key.ctrl && input === 'h') {
        setMode('history')
        return
      }
      if (key.ctrl && input === 'g') {
        setMode('content')
        return
      }
      if (key.return && url) {
        await navigateTo(url)
        return
      }
      if (key.backspace || key.delete) {
        setUrl(prev => prev.slice(0, -1))
        setRefresh(k => k + 1)
        return
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta && !key.alt) {
        setUrl(prev => prev + input)
        setRefresh(k => k + 1)
        return
      }
    }

    // History mode
    if (mode === 'history') {
      if (key.escape) {
        setMode('navigate')
        return
      }
      if (!isNaN(Number(input)) && Number(input) >= 1 && Number(input) <= history.length) {
        const entry = history[history.length - Number(input)]
        if (entry) {
          setUrl(entry.url)
          setMode('navigate')
          await navigateTo(entry.url)
        }
      }
    }

    // Content mode
    if (mode === 'content') {
      if (key.escape || key.ctrl && input === 'g') {
        setMode('navigate')
        return
      }
    }
  })

  const currentUrl = history.length > 0 ? history[history.length - 1]?.url : ''

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">
          🌐 Browser
        </Text>
        <Text dimColor> {' '}| Cline-style web automation</Text>
      </Box>

      {/* Mode indicator */}
      <Box marginBottom={1}>
        <Text color={mode === 'navigate' ? 'green' : 'gray'}>
          [NAV]
        </Text>
        <Text color={mode === 'history' ? 'green' : 'gray'}>
          {' '}[HIST]
        </Text>
        <Text color={mode === 'content' ? 'green' : 'gray'}>
          {' '}[CONTENT]
        </Text>
        <Text dimColor>
          {' '}| {mode === 'navigate' ? 'Type URL + Enter to navigate' : mode === 'history' ? '1-9 to navigate to history entry' : 'Reading page content'}
        </Text>
      </Box>

      {/* URL Input */}
      <Box flexDirection="row" marginBottom={1}>
        <Text color="cyan" bold>
          URL:{' '}
        </Text>
        <Text color="white">
          {url || '(type URL and press Enter)'}
        </Text>
        <Text color="white">█</Text>
      </Box>

      {/* Page info */}
      {currentUrl && (
        <Box marginBottom={1}>
          <Text dimColor>
            Current: {pageTitle ? `${pageTitle} — ` : ''}{currentUrl}
          </Text>
        </Box>
      )}

      {/* Status */}
      <Box marginBottom={1}>
        <Text color={error ? 'red' : 'green'}>{status}</Text>
      </Box>

      {/* Error message */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Screenshot display */}
      {showScreenshot && lastScreenshot && (
        <Box marginBottom={1} borderStyle="single" borderColor="cyan" padding={1}>
          <Text color="cyan" bold>
            📸 Screenshot
          </Text>
          <ImageDisplay
            base64={lastScreenshot}
            mediaType="image/png"
            visible={showScreenshot}
            altText="Screenshot captured"
          />
        </Box>
      )}

      {/* History list */}
      {history.length > 0 && mode === 'navigate' && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>Recent:</Text>
          {history.slice(-5).reverse().map((entry, i) => (
            <Box key={entry.timestamp} flexDirection="row">
              <Text dimColor>  {history.length - i}. </Text>
              <Text dimColor>{entry.url}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* History mode listing */}
      {mode === 'history' && history.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>History (press number to navigate):</Text>
          {history.slice().reverse().map((entry, i) => (
            <Box key={entry.timestamp} flexDirection="row">
              <Text color="cyan">[{history.length - i}] </Text>
              <Text>{entry.url}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Keyboard shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>
          Enter: navigate | Ctrl+D: close | Ctrl+L: hide screenshot
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          Ctrl+H: history | Ctrl+G: content | Esc: exit
        </Text>
      </Box>
    </Box>
  )
}

const browser = {
  type: 'local-jsx' as const,
  name: 'browser',
  description: 'Interactive web browser (navigate URLs, take screenshots, interact with pages)',
  aliases: ['browse', 'web'],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default browser
