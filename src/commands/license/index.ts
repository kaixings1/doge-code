import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'license')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface LicenseInfo {
  name: string
  license: string
  version: string
  repository?: string
  publisher?: string
}

interface LicenseConfig {
  projectName: string
  author: string
  year: number
  defaultLicense: string
  allowedLicenses: string[]
  restrictedLicenses: string[]
  requireLicenseHeader: boolean
  checkOnInstall: boolean
}

interface LicenseRecord {
  date: string
  total: number
  compatible: number
  restricted: number
  missing: number
  status: string
}

const LICENSE_TEMPLATES: Record<string, (name: string, year: number) => string> = {
  mit: (name, year) => `MIT License

Copyright (c) ${year} ${name}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  apache: (name, year) => `Apache License 2.0

Copyright ${year} ${name}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,

  gpl: (name, year) => `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) ${year} ${name}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.`,

  bsd: (name, year) => `BSD 3-Clause License

Copyright (c) ${year}, ${name}
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.`,

  isc: (name, year) => `ISC License

Copyright (c) ${year} ${name}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
}

const DEFAULT_CONFIG: LicenseConfig = {
  projectName: 'my-project',
  author: 'Your Name',
  year: new Date().getFullYear(),
  defaultLicense: 'mit',
  allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'MIT-0'],
  restrictedLicenses: ['GPL-3.0', 'AGPL-3.0', 'SSPL-1.0', 'BUSL-1.1'],
  requireLicenseHeader: false,
  checkOnInstall: false,
}

function loadConfig(): LicenseConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: LicenseConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): LicenseRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: LicenseRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function run(cmd: string, timeout = 30000): { ok: boolean; output: string } {
  try { return { ok: true, output: execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim() } }
  catch (e: any) { return { ok: false, output: e.message || 'Failed' } }
}

function getDependencyLicenses(): LicenseInfo[] {
  const result = run('npx license-checker --json 2>/dev/null')
  if (!result.ok) return []
  try {
    const data = JSON.parse(result.output)
    return Object.entries(data).map(([name, info]: [string, any]) => ({
      name: name.replace(/@.*?\//, '').replace(/@\d+.*$/, ''),
      license: info.licenses || 'Unknown',
      version: info.version || '',
      repository: info.repository || '',
      publisher: info.publisher || '',
    }))
  } catch { return [] }
}

function classifyLicense(license: string, config: LicenseConfig): 'allowed' | 'restricted' | 'unknown' {
  const lic = license.trim()
  if (config.allowedLicenses.some(a => lic.includes(a))) return 'allowed'
  if (config.restrictedLicenses.some(r => lic.includes(r))) return 'restricted'
  return 'unknown'
}

function detectProjectLicense(): string {
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'COPYING']) {
    if (existsSync(file)) return file
  }
  try {
    if (existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      if (pkg.license) return 'package.json: ' + pkg.license
    }
  } catch { /* ignore */ }
  return 'None found'
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['License Manager (Advanced)', '', '📖 Usage: ', '  /license                        Check project license', '  /license list                   List dependency licenses', '  /license check                  Check compatibility', '  /license audit                  Audit for restricted licenses', '  /license report                 Full report', '  /license generate <type>        Generate LICENSE file', '  /license templates              Available license templates', '  /license allow <license>        Add to allowed list', '  /license restrict <license>     Add to restricted list', '  /license history                Audit history', '  /license config                 Show/edit config', '  /license set <key> <val>        Set config value', '  /license spdx                   SPDX identifiers', ''].join('\n') }

  if (cmd === 'templates') {
    const lines = ['Available Templates:', '═══════════════════', '']
    Object.keys(LICENSE_TEMPLATES).forEach(t => lines.push(`  ${t}`))
    lines.push('', 'Generate with: /license generate <type>')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /license set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'allow') {
    const lic = parts[1]; if (!lic) return { type: 'text', value: 'Usage: /license allow <license>' }
    config.allowedLicenses.push(lic); saveConfig(config)
    return { type: 'text', value: `✅ [OK] Allowed: ${lic}` }
  }

  if (cmd === 'restrict') {
    const lic = parts[1]; if (!lic) return { type: 'text', value: 'Usage: /license restrict <license>' }
    config.restrictedLicenses.push(lic); saveConfig(config)
    return { type: 'text', value: `✅ [OK] Restricted: ${lic}` }
  }

  if (cmd === 'generate') {
    const type = (parts[1] || config.defaultLicense).toLowerCase()
    const template = LICENSE_TEMPLATES[type]
    if (!template) return { type: 'text', value: `❌ Unknown template: ${type}\nAvailable: ${Object.keys(LICENSE_TEMPLATES).join(', ')}` }
    const content = template(config.projectName, config.year)
    writeFileSync('LICENSE', content, 'utf-8')
    return { type: 'text', value: `✅ [OK] Generated LICENSE (${type})\nAuthor: ${config.author}\nYear: ${config.year}\n\n${content.slice(0, 200)}...` }
  }

  if (cmd === 'list') {
    const deps = getDependencyLicenses()
    if (deps.length === 0) return { type: 'text', value: 'No dependency data. Install license-checker: npm install -g license-checker' }
    const lines = ['Dependency Licenses (' + deps.length + '):', '═══════════════════════════', '']
    deps.slice(0, 30).forEach(d => lines.push(`  ${d.name}@${d.version} - ${d.license}`))
    if (deps.length > 30) lines.push(`... ${deps.length - 30} more (run /license report for full list)`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'check' || cmd === 'audit') {
    const deps = getDependencyLicenses()
    if (deps.length === 0) return { type: 'text', value: 'No dependency data. Install license-checker: npm install -g license-checker' }
    let allowed = 0, restricted = 0, unknown = 0
    const restrictedList: string[] = []
    const unknownList: string[] = []
    deps.forEach(d => {
      const status = classifyLicense(d.license, config)
      if (status === 'allowed') allowed++
      else if (status === 'restricted') { restricted++; restrictedList.push(`${d.name}@${d.version} (${d.license})`) }
      else { unknown++; unknownList.push(`${d.name}@${d.version} (${d.license})`) }
    })
    const passed = restricted === 0
    saveHistory({ date: new Date().toISOString(), total: deps.length, compatible: allowed, restricted, missing: unknown, status: passed ? 'PASS' : 'FAIL' })
    const lines = ['License Audit:', '══════════════', '', `Total: ${deps.length}`, `✅ Allowed: ${allowed}`, `🚫 Restricted: ${restricted}`, `❓ Unknown: ${unknown}`, '', 'Restricted:', ...(restrictedList.length ? restrictedList : ['  (none)']), '', 'Unknown:', ...(unknownList.length ? unknownList.slice(0, 10) : ['  (none)']), '', `Result: ${passed ? '[PASS] No restricted licenses' : '[FAIL] Restricted licenses found'}`, '', 'Project: ' + detectProjectLicense()]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'report') {
    const deps = getDependencyLicenses()
    const lines = ['License Report:', '═══════════════', '', 'Project: ' + detectProjectLicense(), 'Total deps: ' + deps.length, '', 'Licenses in use:']
    const byLicense: Record<string, number> = {}
    deps.forEach(d => { byLicense[d.license] = (byLicense[d.license] || 0) + 1 })
    Object.entries(byLicense).sort((a: any, b: any) => b[1] - a[1]).forEach(([lic, count]) => lines.push(`  ${lic}: ${count}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No audit history. Run /license check first.' }
    const lines = ['Audit History:', '══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.status} | ${h.total} deps | ${h.restricted} restricted | ${h.missing} unknown`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'spdx') return { type: 'text', value: 'SPDX License List: https://spdx.org/licenses/\n\nCommon: MIT, Apache-2.0, GPL-3.0, BSD-3-Clause, ISC, Unlicense, MPL-2.0, LGPL-3.0' }

  return { type: 'text', value: 'Project License:\n════════════════\n' + detectProjectLicense() + '\n\nRun /license check for dependency audit' }
}

const license: Command = {
  type: 'local', name: 'license',
  description: 'License - list/check/audit/report/generate/templates/allow/restrict/history',
  aliases: ['/license', '/lic'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default license
