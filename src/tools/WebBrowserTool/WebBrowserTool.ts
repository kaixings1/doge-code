import { type Tool } from '../../engine/types.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'

type BrowserAction =
  | { action: 'navigate'; url: string }
  | { action: 'screenshot'; url?: string }
  | { action: 'getContent' }
  | { action: 'click'; selector: string }
  | { action: 'type'; selector: string; text: string }
  | { action: 'scroll'; direction: 'up' | 'down' | 'top' | 'bottom' }
  | { action: 'executeJS'; script: string }
  | { action: 'close' }
  | { action: 'getPageInfo' }

let browserInstance: any = null
let currentPage: any = null
let playwrightModule: any = null

async function getPlaywright() {
  if (!playwrightModule) {
    try {
      playwrightModule = await import('playwright')
    } catch {
      return null
    }
  }
  return playwrightModule
}

async function getBrowser() {
  const pw = await getPlaywright()
  if (!pw) {
    throw new Error('Playwright is not installed. Run: bun add -D playwright && bunx playwright install chromium')
  }
  if (!browserInstance) {
    browserInstance = await pw.chromium.launch({ headless: true })
  }
  return { pw, browser: browserInstance }
}

async function getPage() {
  const { browser } = await getBrowser()
  if (!currentPage || currentPage.isClosed?.()) {
    currentPage = await browser.newPage()
    currentPage.setDefaultTimeout(30000)
  }
  return currentPage
}

function encodeImageToBase64(buffer: Buffer, mediaType: string): string {
  return buffer.toString('base64')
}

export class WebBrowserTool implements Tool {
  name = 'web_browser'
  description = `Web browser automation tool using Playwright.
Actions:
- navigate: Navigate to a URL (e.g., {action: 'navigate', url: 'https://example.com'})
- screenshot: Take a screenshot of current page (returns image data)
- getContent: Get the visible text content of the current page
- click: Click an element by CSS selector (e.g., {action: 'click', selector: 'button.submit'})
- type: Type text into an input field (e.g., {action: 'type', selector: '#search', text: 'hello'})
- scroll: Scroll the page (direction: up/down/top/bottom)
- executeJS: Execute JavaScript and return result (e.g., {action: 'executeJS', script: 'document.title'})
- close: Close the browser session
- getPageInfo: Get current page URL, title, and status`

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['navigate', 'screenshot', 'getContent', 'click', 'type', 'scroll', 'executeJS', 'close', 'getPageInfo'],
        description: 'The browser action to perform',
      },
      url: { type: 'string', description: 'URL to navigate to (for navigate action)' },
      selector: { type: 'string', description: 'CSS selector for click/type actions' },
      text: { type: 'string', description: 'Text to type into input field' },
      direction: { type: 'string', description: 'Scroll direction: up, down, top, bottom', enum: ['up', 'down', 'top', 'bottom'] },
      script: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['action'],
  } as Record<string, unknown>

  timeout = 60000

  validate = (params: unknown) => {
    const p = params as BrowserAction
    const errors: string[] = []

    if (!p || typeof p !== 'object' || !('action' in p)) {
      return { valid: false, errors: ['Missing required field: action'] }
    }

    const validActions = ['navigate', 'screenshot', 'getContent', 'click', 'type', 'scroll', 'executeJS', 'close', 'getPageInfo']
    if (!validActions.includes(p.action)) {
      errors.push(`Invalid action: ${p.action}. Must be one of: ${validActions.join(', ')}`)
    }

    if (p.action === 'navigate' && !p.url) {
      errors.push('url is required for navigate action')
    }
    if (p.action === 'click' && !p.selector) {
      errors.push('selector is required for click action')
    }
    if (p.action === 'type') {
      if (!p.selector) errors.push('selector is required for type action')
      if (p.text === undefined) errors.push('text is required for type action')
    }
    if (p.action === 'scroll' && !p.direction) {
      errors.push('direction is required for scroll action')
    }
    if (p.action === 'executeJS' && !p.script) {
      errors.push('script is required for executeJS action')
    }

    return { valid: errors.length === 0, errors }
  }

  execute = async (params: unknown) => {
    const p = params as BrowserAction

    if (p.action === 'close') {
      if (currentPage && !currentPage.isClosed?.()) {
        await currentPage.close()
      }
      currentPage = null
      if (browserInstance) {
        await browserInstance.close()
        browserInstance = null
      }
      playwrightModule = null
      return { content: [{ type: 'text', text: 'Browser closed successfully.' }] }
    }

    try {
      const pw = await getPlaywright()
      if (!pw) {
        return {
          content: [{
            type: 'text',
            text: 'Playwright is not installed.\n\nTo enable browser automation:\n1. Run: bun add -D playwright\n2. Run: bunx playwright install chromium\n\nAfter installation, restart doge.',
          }],
        }
      }

      switch (p.action) {
        case 'navigate': {
          const page = await getPage()
          await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          const title = await page.title()
          const url = page.url()
          return {
            content: [{
              type: 'text',
              text: `Navigated to: ${url}\nPage title: ${title}`,
            }],
          }
        }

        case 'screenshot': {
          const page = await getPage()
          if (p.url) {
            await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          }
          const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false })
          const base64 = encodeImageToBase64(screenshotBuffer, 'image/png')

          return {
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  data: base64,
                  media_type: 'image/png',
                },
              },
              {
                type: 'text',
                text: `Screenshot captured (${screenshotBuffer.length} bytes).`,
              },
            ],
          }
        }

        case 'getPageInfo': {
          const page = await getPage()
          const url = page.url()
          const title = await page.title()
          return {
            content: [{
              type: 'text',
              text: `URL: ${url}\nTitle: ${title}`,
            }],
          }
        }

        case 'getContent': {
          const page = await getPage()
          const content = await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
            const parts: string[] = []
            let node: Text | null
            while ((node = walker.nextNode() as Text | null)) {
              const text = node.textContent?.trim()
              if (text) parts.push(text)
            }
            return parts.join('\n').slice(0, 10000)
          })
          return {
            content: [{ type: 'text', text: content || '(empty page)' }],
          }
        }

        case 'click': {
          const page = await getPage()
          await page.click(p.selector, { timeout: 10000 })
          await page.waitForTimeout(500)
          return {
            content: [{ type: 'text', text: `Clicked: ${p.selector}` }],
          }
        }

        case 'type': {
          const page = await getPage()
          await page.fill(p.selector, p.text, { timeout: 10000 })
          return {
            content: [{ type: 'text', text: `Typed "${p.text}" into ${p.selector}` }],
          }
        }

        case 'scroll': {
          const page = await getPage()
          const key = p.direction === 'top' ? 'Home' : p.direction === 'bottom' ? 'End' : p.direction === 'up' ? 'ArrowUp' : 'ArrowDown'
          await page.keyboard.press(key)
          return {
            content: [{ type: 'text', text: `Scrolled ${p.direction}` }],
          }
        }

        case 'executeJS': {
          const page = await getPage()
          const result = await page.evaluate(p.script)
          const text = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
          return {
            content: [{ type: 'text', text: `Result: ${text}` }],
          }
        }

        default:
          return { content: [{ type: 'text', text: `Unknown action: ${(p as BrowserAction).action}` }] }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Browser error: ${message}` }] }
    }
  }
}
