/**
 * pluginMarketplace.ts — 桌面端插件市场服务
 *
 * 精简版插件市场，支持浏览和安装在线插件：
 * - 从 GitHub raw URL 获取市场清单
 * - 解析插件列表
 * - 下载并安装插件（GitHub 仓库 zip 下载）
 * - 检测已安装状态
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as zlib from 'zlib'
import { spawn, execFile } from 'child_process'

// ─── 类型 ───

export interface MarketplacePlugin {
  name: string
  description?: string
  version?: string
  source: string
  repo?: string
  installed: boolean
}

export interface MarketplaceInfo {
  name: string
  source: string
  plugins: MarketplacePlugin[]
}

// ─── 默认市场源 ───

const DEFAULT_MARKETPLACES: Array<{ name: string; url: string }> = [
  {
    name: 'claude-plugin-directory',
    url: 'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json',
  },
]

// ─── HTTP 工具 ───

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location).then(resolve, reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8')
          resolve(JSON.parse(text))
        } catch (e) {
          reject(new Error('解析市场数据失败'))
        }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ─── 插件安装 ───

function downloadZip(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, { timeout: 60000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadZip(res.headers.location!, destPath).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', reject)
    }).on('error', reject)
  })
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(zipPath)
    const extract = zlib.createGunzip()
    // 简化版：假设 zip 使用 deflate 压缩（GitHub archive 默认）
    // 实际 GitHub archive 可能是 deflate 或 store
    stream.pipe(extract)

    // 更简单的方式：使用 Node.js 内置 unzip
    // 由于 Node.js 没有内置 zip 解析器，我们使用 child_process 调用 tar
    // execFile is already imported at the top of this file
    fs.unlinkSync(zipPath)

    // 使用 PowerShell 的 Expand-Archive（Windows 自带）
    const psCmd = process.platform === 'win32'
      ? `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
      : `tar -xzf ${zipPath} -C ${destDir}`

    execFile(process.platform === 'win32' ? 'powershell' : 'tar', [
      ...(process.platform === 'win32' ? ['-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`] : ['-xzf', zipPath, '-C', destDir])
    ], { timeout: 60000 }, (err) => {
      if (err) reject(new Error(`解压失败: ${err.message}`))
      else resolve()
    })
  })
}

function cloneGitRepo(repo: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, destDir], {
      timeout: 60000,
    })
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`git clone 失败: exit ${code}`))
    })
    child.on('error', reject)
  })
}

// ─── 公共 API ───

/**
 * 获取所有市场及插件列表
 */
export async function getMarketplaces(projectRoot: string): Promise<MarketplaceInfo[]> {
  const results: MarketplaceInfo[] = []

  for (const marketplace of DEFAULT_MARKETPLACES) {
    try {
      const raw = await fetchJson(marketplace.url)

      // 解析插件列表
      const plugins: MarketplacePlugin[] = []
      const pluginDirs = getInstalledPluginDirs(projectRoot)
      const installedNames = new Set(pluginDirs.map(d => path.basename(d).toLowerCase()))

      const pluginList = (raw as Record<string, unknown>).plugins as Array<Record<string, unknown>> || []
      for (const entry of pluginList) {
        const sourceInfo = entry.source as Record<string, unknown> | undefined
        const repo = sourceInfo?.repo as string | undefined
        plugins.push({
          name: (entry.name as string) || '',
          description: (entry.description as string) || undefined,
          version: (entry.version as string) || undefined,
          source: marketplace.name,
          repo: repo,
          installed: repo ? installedNames.has(repo.split('/').pop()?.toLowerCase() || '') : false,
        })
      }

      results.push({
        name: marketplace.name,
        source: marketplace.url,
        plugins,
      })
    } catch (e) {
      // 单个市场加载失败，继续下一个
      results.push({
        name: marketplace.name,
        source: marketplace.url,
        plugins: [],
      })
    }
  }

  return results
}

/**
 * 从市场安装插件
 */
export async function installPluginFromMarketplace(
  projectRoot: string,
  pluginName: string,
  repo: string,
): Promise<{ success: boolean; error?: string }> {
  const pluginsDir = path.join(projectRoot, '.doge', 'plugins')
  fs.mkdirSync(pluginsDir, { recursive: true })

  const pluginDirName = repo.split('/').pop() || pluginName
  const destDir = path.join(pluginsDir, pluginDirName)

  if (fs.existsSync(destDir)) {
    return { success: false, error: `插件 "${pluginName}" 已存在` }
  }

  const tmpDir = path.join(pluginsDir, '_tmp_install')
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    // 尝试 git clone（更快）
    try {
      await cloneGitRepo(repo, path.join(tmpDir, pluginDirName))
    } catch {
      // 回退：下载 GitHub archive zip
      const zipUrl = `https://github.com/${repo}/archive/refs/heads/main.zip`
      const zipPath = path.join(tmpDir, `${pluginDirName}.zip`)
      await downloadZip(zipUrl, zipPath)

      // 解压
      const extractDir = path.join(tmpDir, '_extract')
      fs.mkdirSync(extractDir, { recursive: true })

      if (process.platform === 'win32') {
        await extractZip(zipPath, extractDir)
      } else {
        await new Promise<void>((resolve, reject) => {
          spawn('tar', ['-xzf', zipPath, '-C', extractDir], { timeout: 60000 })
            .on('close', code => code === 0 ? resolve() : reject(new Error(`解压失败: exit ${code}`)))
            .on('error', reject)
        })
      }

      // 找到解压后的目录（通常有一个带版本前缀的目录）
      const entries = fs.readdirSync(extractDir)
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        fs.renameSync(path.join(extractDir, entries[0]), path.join(tmpDir, pluginDirName))
      }
    }

    // 将插件目录复制到目标位置
    const srcDir = path.join(tmpDir, pluginDirName)
    if (!fs.existsSync(srcDir)) {
      return { success: false, error: '安装源目录不存在' }
    }

    copyDirRecursive(srcDir, destDir)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '安装失败' }
  } finally {
    // 清理临时目录
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ─── 工具函数 ───

function getInstalledPluginDirs(projectRoot: string): string[] {
  const pluginsDir = path.join(projectRoot, '.doge', 'plugins')
  if (!fs.existsSync(pluginsDir)) return []
  try {
    return fs.readdirSync(pluginsDir)
      .filter(name => fs.statSync(path.join(pluginsDir, name)).isDirectory())
  } catch {
    return []
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
