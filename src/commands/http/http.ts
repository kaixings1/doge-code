import type { LocalJSXCommandCall } from '../../types/command.js'
import React from 'react'
import { URL } from 'url'
import * as http from 'http'
import * as https from 'https'
import * as http2 from 'http2'
import * as zlib from 'zlib'
import * as fs from 'fs'
import * as path from 'path'
import * as querystring from 'querystring'
import { createHash } from 'crypto'
import { promisify } from 'util'

const pipelineAsync = promisify(require('stream').pipeline)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ==================== Cookie Jar 自动保存 ====================
class CookieJar {
  private cookies: Map<string, string> = new Map()
  private filePath: string | null = null

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = filePath
      this.loadFromFile()
    }
  }
  loadFromFile() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(data)
      for (const [key, value] of Object.entries(parsed)) {
        this.cookies.set(key, value as string)
      }
    } catch (e) { /* ignore */ }
  }
  saveToFile() {
    if (!this.filePath) return
    const obj: Record<string, string> = {}
    for (const [k, v] of this.cookies) {
      obj[k] = v
    }
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf-8')
  }
  setCookie(cookieString: string) {
    const parts = cookieString.split(';')[0].split('=')
    if (parts.length >= 2) {
      const name = parts[0].trim()
      const value = parts.slice(1).join('=')
      this.cookies.set(name, value)
      if (this.filePath) this.saveToFile()
    }
  }
  getCookieHeader(): string {
    const pairs: string[] = []
    for (const [k, v] of this.cookies) {
      pairs.push(`${k}=${v}`)
    }
    return pairs.join('; ')
  }
  updateFromResponse(headers: Record<string, string | string[] | undefined>) {
    const setCookie = headers['set-cookie']
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
      for (const cookie of cookies) {
        this.setCookie(cookie)
      }
    }
  }
}
// ==================== 修正并发信号量 ====================
function createSemaphore(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  return {
    get active() { return active },
    acquire: () => new Promise<void>((resolve) => {
      if (active < max) {
        active++
        resolve()
      } else {
        queue.push(resolve)
      }
    }),
    release: () => {
      if (queue.length > 0) {
        const next = queue.shift()!
        next()
      } else {
        active--
      }
    },
  }
}

// ==================== 参数解析 ====================
function parseArgs(argsStr: string) {
  const tokens = argsStr.trim().split(/\s+/)
  const result = {
    url: '',
    method: 'GET',
    body: null as string | null,
    headers: {} as Record<string, string>,
    timeout: 10000,
    retry: 0,
    proxy: null as string | null,
    form: {} as Record<string, string | { filePath: string; filename?: string }>,
    isMultipart: false,
    output: null as string | null,
    token: null as string | null,
    user: null as string | null,
    cert: null as string | null,
    key: null as string | null,
    insecure: false,
    verbose: false,
    headOnly: false,
    outputFormat: 'auto' as 'auto' | 'markdown' | 'json',
    concurrent: 1,
    urlsFile: null as string | null,
    delay: 0,
    rate: null as string | null,
    stdin: false,
    preScript: null as string | null,
    postScript: null as string | null,
    cookie: null as string | null,
    cookieJar: null as string | null,
    diffWithLast: false,
    schemaFile: null as string | null,
    rawBodyProvided: false,
  }
  let i = 0
  if (tokens.length > 0) {
    result.url = tokens[i++]
  }
  if (i < tokens.length && /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(tokens[i])) {
    result.method = tokens[i].toUpperCase()
    i++
  }
  const bodyParts: string[] = []
  while (i < tokens.length && !tokens[i].startsWith('--')) {
    bodyParts.push(tokens[i])
    i++
  }
  if (bodyParts.length > 0) {
    result.body = bodyParts.join(' ')
    result.rawBodyProvided = true
  }
  const flags: Record<string, string | boolean | string[]> = {}
  while (i < tokens.length) {
    const flag = tokens[i]
    if (flag.startsWith('--')) {
      const flagName = flag.slice(2)
      if (['retry', 'timeout', 'delay', 'concurrent', 'output', 'proxy', 'token', 'user', 'cert', 'key',
            'urls', 'rate', 'cookie', 'cookie-jar', 'schema', 'pre-script', 'post-script', 'output-format'].includes(flagName)) {
        if (i + 1 < tokens.length) {
          flags[flagName] = tokens[i + 1]
          i += 2
        } else {
          i++
        }
      } else if (['insecure', 'verbose', 'head', 'stdin', 'diff', 'form-multipart'].includes(flagName)) {
        flags[flagName] = true
        i++
      } else if (flagName === 'header' && i + 1 < tokens.length) {
        const headerPair = tokens[i + 1]
        const colonIndex = headerPair.indexOf(':')
        if (colonIndex > 0) {
          const key = headerPair.substring(0, colonIndex).trim()
          const value = headerPair.substring(colonIndex + 1).trim()
          result.headers[key] = value
        }
        i += 2
      } else if (flagName === 'form') {
        if (i + 1 < tokens.length) {
          const formItem = tokens[i + 1]
          const atIndex = formItem.indexOf('@')
          if (atIndex > 0) {
            const key = formItem.substring(0, atIndex)
            const filePath = formItem.substring(atIndex + 1)
            result.form[key] = { filePath, filename: path.basename(filePath) }
            result.isMultipart = true
          } else {
            const eqIndex = formItem.indexOf('=')
            if (eqIndex > 0) {
              const key = formItem.substring(0, eqIndex)
              const value = formItem.substring(eqIndex + 1)
              result.form[key] = value
            } else {
              result.form[formItem] = ''
            }
          }
          i += 2
        } else {
          i++
        }
      } else {
        i++
      }
    } else {
      i++
    }
  }
  if (flags.retry) result.retry = parseInt(flags.retry as string, 10) || 0
  if (flags.timeout) result.timeout = parseInt(flags.timeout as string, 10) || 10000
  if (flags.delay) result.delay = parseInt(flags.delay as string, 10) || 0
  if (flags.concurrent) result.concurrent = parseInt(flags.concurrent as string, 10) || 1
  if (flags.output) result.output = flags.output as string
  if (flags.proxy) result.proxy = flags.proxy as string
  if (flags.token) result.token = flags.token as string
  if (flags.user) result.user = flags.user as string
  if (flags.cert) result.cert = flags.cert as string
  if (flags.key) result.key = flags.key as string
  if (flags.urls) result.urlsFile = flags.urls as string
  if (flags.rate) result.rate = flags.rate as string
  if (flags.cookie) result.cookie = flags.cookie as string
  if (flags['cookie-jar']) result.cookieJar = flags['cookie-jar'] as string
  if (flags.schema) result.schemaFile = flags.schema as string
  if (flags['pre-script']) result.preScript = flags['pre-script'] as string
  if (flags['post-script']) result.postScript = flags['post-script'] as string
  if (flags['output-format']) {
    const fmt = (flags['output-format'] as string).toLowerCase()
    if (fmt === 'json' || fmt === 'markdown') result.outputFormat = fmt
  }
  result.insecure = !!flags.insecure
  result.verbose = !!flags.verbose
  result.headOnly = !!flags.head
  result.stdin = !!flags.stdin
  result.diffWithLast = !!flags.diff
  if (flags['form-multipart']) result.isMultipart = true
  if (Object.values(result.form).some(v => typeof v === 'object' && 'filePath' in v)) {
    result.isMultipart = true
  }
  return result
}
// ==================== 构建请求体（multipart/form-data, urlencoded, json） ====================
async function buildRequestBody(options: any) {
  if (options.isMultipart) {
    const boundary = '----' + createHash('md5').update(Date.now().toString()).digest('hex')
    const chunks: Buffer[] = []
    for (const [key, value] of Object.entries(options.form)) {
      chunks.push(Buffer.from(`--${boundary}\r\n`))
      if (typeof value === 'object' && 'filePath' in value) {
        const fileData = await fs.promises.readFile(value.filePath)
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"; filename="${value.filename}"\r\n`))
        chunks.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`))
        chunks.push(fileData)
        chunks.push(Buffer.from(`\r\n`))
      } else {
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`))
        chunks.push(Buffer.from(String(value)))
        chunks.push(Buffer.from(`\r\n`))
      }
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`))
    const body = Buffer.concat(chunks)
    options.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`
    options.headers['Content-Length'] = body.length.toString()
    return body
  } else if (options.body && !options.rawBodyProvided) {
    if (options.body.trim().startsWith('{') || options.body.trim().startsWith('[')) {
  try {
        JSON.parse(options.body)
        if (!options.headers['Content-Type']) {
          options.headers['Content-Type'] = 'application/json'
    }
      } catch {}
    } else if (Object.keys(options.form).length > 0) {
      const encoded = querystring.stringify(options.form as Record<string, unknown>)
      options.body = encoded
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
    }
  } else if (options.stdin && !options.body) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk)
    }
    options.body = Buffer.concat(chunks).toString()
  }
  if (typeof options.body === 'string') {
    return Buffer.from(options.body)
  }
  return options.body || null
}

// ==================== 执行单个 HTTP 请求 ====================
async function performRequest(requestOptions: any, options: any) {
  const urlObj = new URL(requestOptions.url)
    const isHttps = urlObj.protocol === 'https:'
  const useHttp2 = requestOptions.http2 === true

  let req: any
  let res: any
  let responseData = Buffer.alloc(0)
  let requestOpts: http.RequestOptions | https.RequestOptions | http2.ClientSessionOptions
  if (options.proxy) {
    const proxyUrl = new URL(options.proxy)
    requestOpts = {
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
      path: urlObj.href,
      method: requestOptions.method,
      headers: { ...requestOptions.headers, Host: urlObj.host },
    }
  } else {
    requestOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: requestOptions.method,
      headers: requestOptions.headers,
    }
  }

  if (options.insecure && isHttps) {
    (requestOpts as https.RequestOptions).rejectUnauthorized = false
  }
  if (options.cert && options.key) {
    (requestOpts as https.RequestOptions).cert = fs.readFileSync(options.cert)
    ;(requestOpts as https.RequestOptions).key = fs.readFileSync(options.key)
    }

  const startTime = Date.now()
  const responsePromise = new Promise((resolve, reject) => {
    if (useHttp2 && isHttps) {
      const client = http2.connect(urlObj.origin, requestOpts as http2.ClientSessionOptions)
      req = client.request({
        ':method': requestOptions.method,
        ':path': requestOpts.path,
        ...requestOptions.headers,
      })
      res = req
      req.on('response', (headers: any) => {
        res.headers = headers
      })
      req.on('data', (chunk: Buffer) => {
        responseData = Buffer.concat([responseData, chunk])
      })
      req.on('end', () => {
          resolve({
          status: res.headers[':status'],
          statusText: http.STATUS_CODES[res.headers[':status']] || '',
            headers: res.headers,
          body: responseData,
        })
      })
      req.on('error', reject)
      if (requestOptions.body) {
        req.write(requestOptions.body)
      }
      req.end()
    } else {
      const httpModule = isHttps ? https : http
      req = httpModule.request(requestOpts, (resp: any) => {
        const chunks: Buffer[] = []
        resp.on('data', (chunk: Buffer) => chunks.push(chunk))
        resp.on('end', () => {
          let body = Buffer.concat(chunks)
          const encoding = resp.headers['content-encoding']
          if (encoding === 'gzip') {
            body = zlib.gunzipSync(body)
          } else if (encoding === 'deflate') {
            body = zlib.inflateSync(body)
          }
          resolve({
            status: resp.statusCode,
            statusText: resp.statusMessage || '',
            headers: resp.headers,
            body: body,
          })
        })
      })
      req.on('error', reject)
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('请求超时'))
      })
      if (requestOptions.body) {
        req.write(requestOptions.body)
      }
      req.end()
    }
    })

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`请求超时 (${options.timeout}ms)`)), options.timeout + 500)
  })
  const response = await Promise.race([responsePromise, timeoutPromise]) as unknown as Record<string, unknown>
  const duration = Date.now() - startTime
  return { response, duration, responseData: response.body }
}
// ==================== 重试逻辑 ====================
async function requestWithRetry(requestOptions: any, options: any, retryCount = 0): Promise<any> {
  try {
    return await performRequest(requestOptions, options)
  } catch (err: any) {
    if (retryCount < options.retry) {
      const delay = Math.pow(2, retryCount) * 1000
      if (options.verbose) console.log(`重试 ${retryCount+1}/${options.retry}，等待 ${delay}ms`)
      await sleep(delay)
      return requestWithRetry(requestOptions, options, retryCount + 1)
    }
    throw err
  }
}
// ==================== 批量请求（并发、延迟、限速） ====================
function parseRateLimit(rateStr: string): number | null {
  const match = rateStr.match(/^(\d+)\/(min|sec|hour)$/)
  if (!match) return null
  const count = parseInt(match[1], 10)
  const unit = match[2]
  let perSecond = 0
  if (unit === 'sec') perSecond = count
  else if (unit === 'min') perSecond = count / 60
  else if (unit === 'hour') perSecond = count / 3600
  return perSecond
}

async function batchRequests(urls: string[], options: any, baseRequestOpts: any) {
  const results: any[] = []
  const rateLimit = options.rate ? parseRateLimit(options.rate) : null
  let lastRequestTime = 0
  const semaphore = createSemaphore(options.concurrent)

  const tasks = urls.map(async (url, idx) => {
    await semaphore.acquire()
    try {
      if (options.delay > 0 && idx > 0) {
        await sleep(options.delay)
      }
      if (rateLimit) {
        const now = Date.now()
        const minInterval = 1000 / rateLimit
        const elapsed = now - lastRequestTime
        if (elapsed < minInterval) {
          await sleep(minInterval - elapsed)
        }
        lastRequestTime = Date.now()
      }
      const requestOpts = { ...baseRequestOpts, url }
      const result = await requestWithRetry(requestOpts, options, 0)
      results.push({ url, ...result })
    } catch (err: any) {
      results.push({ url, error: err.message })
    } finally {
      semaphore.release()
      }
  })
  await Promise.all(tasks)
  return results
    }

// ==================== Schema 校验 ====================
async function validateSchema(responseBody: string, schemaFile: string | null) {
  if (!schemaFile) return true
  const schemaContent = await fs.promises.readFile(schemaFile, 'utf-8')
  const schema = JSON.parse(schemaContent)
  const body = JSON.parse(responseBody)
  if (schema.required) {
    for (const req of schema.required) {
      if (!(req in body)) return false
    }
  }
  return true
}

// ==================== 前后置脚本 ====================
async function runScript(scriptPath: string | null, context: any) {
  if (!scriptPath) return context
  const scriptContent = await fs.promises.readFile(scriptPath, 'utf-8')
  const scriptFn = new Function('context', scriptContent)
  const newContext = scriptFn(context)
  return newContext || context
}
// ==================== 保存输出 ====================
async function saveOutput(responseData: any, outputPath: string, format: string, responseBody: string) {
  let content = ''
  if (format === 'json') {
    content = JSON.stringify({
      status: responseData.status,
      statusText: responseData.statusText,
      headers: responseData.headers,
      body: responseBody,
      duration: responseData.duration,
    }, null, 2)
  } else if (format === 'markdown') {
    content = `# HTTP 响应\n\n**状态**: ${responseData.status} ${responseData.statusText}\n\n**耗时**: ${responseData.duration}ms\n\n## 响应头\n\`\`\`\n${Object.entries(responseData.headers).map(([k,v])=>`${k}: ${v}`).join('\n')}\n\`\`\`\n\n## 响应体\n\n\`\`\`\n${responseBody}\n\`\`\``
  } else {
    content = responseBody
  }
  await fs.promises.writeFile(outputPath, content, 'utf-8')
}

// ==================== 渲染 React 结果 ====================
function renderResult(result: any, options: any, responseBody: string) {
  const statusColor = result.status >= 400 ? 'red' : 'green'
  const elements = [
    React.createElement('h2', { key: 'title' }, 'HTTP 请求结果'),
    React.createElement('p', { key: 'url' }, 'URL: ', React.createElement('code', null, result.url)),
    React.createElement('p', { key: 'method' }, '方法: ', React.createElement('strong', null, result.method)),
    React.createElement('p', { key: 'status' }, '状态码: ', React.createElement('strong', { style: { color: statusColor } }, `${result.status} ${result.statusText}`)),
    React.createElement('p', { key: 'duration' }, '耗时: ', result.duration, ' ms'),
  ]
  if (options.verbose) {
    elements.push(React.createElement('h3', { key: 'reqHeaders' }, '请求头'))
    elements.push(React.createElement('pre', { key: 'reqHeadersPre' }, React.createElement('code', null, JSON.stringify(result.sentHeaders, null, 2))))
  }
  elements.push(React.createElement('h3', { key: 'respHeaders' }, '响应头'))
  elements.push(React.createElement('pre', { key: 'respHeadersPre' }, React.createElement('code', null, Object.entries(result.headers).map(([k,v])=>`${k}: ${v}`).join('\n'))))
  elements.push(React.createElement('h3', { key: 'respBody' }, '响应体'))
  let displayBody = responseBody
  if (displayBody.length > 5000 && !options.verbose) {
    displayBody = displayBody.substring(0, 5000) + '\n... (响应被截断)'
}
  elements.push(React.createElement('pre', { key: 'respBodyPre' }, React.createElement('code', null, displayBody)))
  return React.createElement('div', null, ...elements)
}

// ==================== 帮助信息 ====================
const helpText = `HTTP 客户端 - 功能全面的命令行工具

用法:
  /http <URL> [方法] [数据] [选项]
选项:
  --retry N              失败后重试 N 次（指数退避）
  --proxy URL            使用 HTTP/HTTPS 代理
  --form key=value       表单字段（支持文件 key@filepath）
  --form-multipart       强制使用 multipart/form-data
  --output FILE          保存响应到文件
  --token TOKEN          Bearer Token
  --user username:pass   Basic 认证
  --cert cert.pem --key key.pem  客户端证书
  --insecure             忽略 SSL 证书验证
  --verbose              详细输出（请求头等）
  --head                 仅显示响应头（HEAD 请求）
  --output-format json|markdown  输出格式
  --urls FILE            从文件读取 URL 列表（每行一个）
  --concurrent N         并发请求数
  --delay MS             每个请求间隔毫秒
  --rate N/sec|min|hour  速率限制
  --stdin                从标准输入读取请求体
  --cookie STR           设置 Cookie 字符串
  --cookie-jar FILE      保存/加载 Cookie 文件
  --diff                 与上次响应对比（实验性）
  --schema FILE          JSON Schema 验证响应体
  --pre-script FILE      请求前执行脚本
  --post-script FILE     请求后执行脚本
  --timeout MS           超时毫秒（默认10000）
示例:
  /http https://api.example.com/users --token secret --output users.json
  /http https://httpbin.org/post POST --form name=John --form file@./photo.jpg
  /http --urls urls.txt --concurrent 5 --retry 2
  echo '{"name":"test"}' | /http https://api.example.com POST --stdin
  /http https://self-signed.bad.com --insecure --verbose
`
function helpReact() {
    return React.createElement('div', null,
    React.createElement('h2', null, 'HTTP 客户端 - 功能全面版'),
    React.createElement('pre', null, helpText)
      )
}
// ==================== 主命令 ====================
export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if (!args || args.trim() === '') {
    onDone(helpText)
    return helpReact()
  }

  const options = parseArgs(args)

  // 处理 --head 选项：强制使用 HEAD 方法并跳过响应体
  let effectiveMethod = options.method
  let skipBody = false
  if (options.headOnly) {
    effectiveMethod = 'HEAD'
    skipBody = true
  }

  // 初始化 Cookie Jar
  let cookieJar: CookieJar | null = null
  if (options.cookieJar) {
    cookieJar = new CookieJar(options.cookieJar)
  } else if (options.cookie) {
    cookieJar = new CookieJar()
    options.cookie.split(';').forEach(pair => {
      const [name, ...rest] = pair.split('=')
      if (name && rest.length) {
        cookieJar!.setCookie(`${name.trim()}=${rest.join('=')}`)
    }
    })
  }

  // 准备 URL 列表
  let urls: string[] = []
  if (options.urlsFile) {
    const content = await fs.promises.readFile(options.urlsFile, 'utf-8')
    urls = content.split('\n').filter(line => line.trim() && !line.startsWith('#'))
  } else {
    urls = [options.url]
  }

  // 前置脚本
  let context = { url: options.url, method: effectiveMethod, headers: options.headers, body: options.body }
  if (options.preScript) {
    context = await runScript(options.preScript, context)
    options.url = context.url
    effectiveMethod = context.method
    options.headers = context.headers
    options.body = context.body
  }

  // 基础请求选项
  const baseRequestOpts = {
    method: effectiveMethod,
    headers: { ...options.headers },
    url: options.url,
  }
  if (options.token) baseRequestOpts.headers['Authorization'] = `Bearer ${options.token}`
  if (options.user) baseRequestOpts.headers['Authorization'] = `Basic ${Buffer.from(options.user).toString('base64')}`
  if (!skipBody && options.body && !options.isMultipart) {
    baseRequestOpts.body = await buildRequestBody(options)
    if (baseRequestOpts.body && typeof baseRequestOpts.body !== 'string') {
      baseRequestOpts.body = baseRequestOpts.body.toString()
    }
  } else if (!skipBody && options.isMultipart) {
    baseRequestOpts.body = await buildRequestBody(options)
  }
  // 添加 Cookie
  if (cookieJar) {
    const cookieHeader = cookieJar.getCookieHeader()
    if (cookieHeader) {
      baseRequestOpts.headers['Cookie'] = cookieHeader
    }
    }

  // 执行请求
  let finalResults: any[] = []
  if (urls.length > 1 || options.concurrent > 1) {
    finalResults = await batchRequests(urls, options, baseRequestOpts)
  } else {
    const result = await requestWithRetry(baseRequestOpts, options, 0)
    finalResults = [{ url: options.url, ...result }]
  }

  // 后置脚本
  if (options.postScript) {
    for (const res of finalResults) {
      await runScript(options.postScript, { response: res })
      }
  }

  // 处理每个响应并收集输出
  const resultElements: React.ReactNode[] = []
  let allSuccess = true

  for (const res of finalResults) {
    let responseBody = ''
    if (!skipBody && res.response?.body) {
      responseBody = res.response.body.toString()
    }
    // 更新 Cookie Jar
    if (cookieJar && res.response?.headers) {
      cookieJar.updateFromResponse(res.response.headers)
    }
    // 格式化响应体
    const contentType = res.response?.headers['content-type'] || ''

    try {
      if (contentType.includes('application/json')) {
        const jsonData = JSON.parse(responseBody)
        responseBody = JSON.stringify(jsonData, null, 2)
      }
    } catch {}
    // Schema 校验
    if (options.schemaFile) {
      const valid = await validateSchema(responseBody, options.schemaFile)
      if (!valid) {
        resultElements.push(React.createElement('div', { key: res.url, style: { color: 'red' } }, `❌ ${res.url}: Schema 验证失败`))
        allSuccess = false
        continue
      }
    }

    // 保存输出或收集 React 元素
    if (options.output) {
      let outputPath = options.output
      if (urls.length > 1) {
        const urlHash = createHash('md5').update(res.url).digest('hex').slice(0, 8)
        const ext = path.extname(options.output)
        const base = options.output.slice(0, -ext.length)
        outputPath = `${base}_${urlHash}${ext}`
      }
      await saveOutput({ ...res, duration: res.duration, status: res.response?.status, statusText: res.response?.statusText, headers: res.response?.headers }, outputPath, options.outputFormat, responseBody)
      resultElements.push(React.createElement('div', { key: res.url }, `✅ ${res.url} -> 已保存至 ${outputPath}`))
    } else {
      const elem = renderResult({ ...res, method: effectiveMethod, sentHeaders: baseRequestOpts.headers, status: res.response?.status, statusText: res.response?.statusText, headers: res.response?.headers }, options, responseBody)
      resultElements.push(React.createElement('div', { key: res.url }, elem))
    }
    if (res.response?.status >= 400) allSuccess = false
  }

  const summary = allSuccess ? '所有请求成功' : '部分请求失败'
  onDone(summary)


    return React.createElement('div', null,
    React.createElement('h2', null, `批量请求结果 (${finalResults.length} 个)`),
    ...resultElements
    )
}

// ==================== 导出 ====================
export default {
  name: 'http',
  type: 'local-jsx',
  description: 'HTTP 客户端 - 支持重试、代理、表单、认证、并发、速率限制等',
  call: call
}
