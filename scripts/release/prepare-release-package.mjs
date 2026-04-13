import { execFileSync } from 'node:child_process'
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = join(here, '..', '..')
const releaseDir = join(rootDir, 'dist', 'npm')
const releaseBin = join(releaseDir, 'bin', 'claudex.js')
const wrapperSource = join(rootDir, 'scripts', 'release', 'bin', 'claudex.js')
const rootPackage = JSON.parse(
  await readFile(join(rootDir, 'package.json'), 'utf8'),
)

await rm(releaseDir, { recursive: true, force: true })
await mkdir(join(releaseDir, 'bin'), { recursive: true })

await copyFile(wrapperSource, releaseBin)
await chmod(releaseBin, 0o755)
await copyIfPresent(join(rootDir, 'README.md'), join(releaseDir, 'README.md'))
await copyIfPresent(join(rootDir, 'bun.lock'), join(releaseDir, 'bun.lock'))
await copyIfPresent(join(rootDir, 'tsconfig.json'), join(releaseDir, 'tsconfig.json'))
await copyTree(join(rootDir, 'src'), join(releaseDir, 'src'))
await copyTree(join(rootDir, 'shims'), join(releaseDir, 'shims'))
await copyTree(join(rootDir, 'vendor'), join(releaseDir, 'vendor'))

const rootEntries = await readdir(rootDir)
for (const entry of rootEntries) {
  if (entry.endsWith('.node')) {
    await copyFile(join(rootDir, entry), join(releaseDir, entry))
  }
}

const licenseSource = join(rootDir, 'LICENSE.md')
if (existsSync(licenseSource)) {
  await copyFile(licenseSource, join(releaseDir, 'LICENSE.md'))
} else {
  await writeFile(join(releaseDir, 'LICENSE.md'), renderFallbackLicense())
}

const packageName = process.env.NPM_PACKAGE_NAME || '@zyycn/claudex'
const binName = process.env.NPM_BIN_NAME || 'claudex'
const repositoryUrl = getRepositoryUrl()
const homepage = repositoryUrl ? repositoryUrl.replace(/\.git$/, '') : undefined
const version = buildReleaseVersion(rootPackage.version, getGitShortSha())

const publishPackage = {
  name: packageName,
  version,
  description:
    'Claudex CLI distribution built from the synced Doge Code fork.',
  license: 'SEE LICENSE IN LICENSE.md',
  type: 'module',
  packageManager: rootPackage.packageManager || 'bun@1.3.5',
  bin: {
    [binName]: './bin/claudex.js',
  },
  files: [
    'bin',
    'src',
    'shims',
    'vendor',
    'README.md',
    'LICENSE.md',
    'bun.lock',
    'tsconfig.json',
    '*.node',
  ],
  engines: {
    bun: rootPackage.engines?.bun || '>=1.3.5',
    node: rootPackage.engines?.node || '>=24.0.0',
  },
  dependencies: rootPackage.dependencies,
  peerDependencies: rootPackage.peerDependencies,
  peerDependenciesMeta: rootPackage.peerDependenciesMeta,
  repository: repositoryUrl
    ? {
        type: 'git',
        url: repositoryUrl,
      }
    : undefined,
  homepage,
  bugs: homepage
    ? {
        url: `${homepage}/issues`,
      }
    : undefined,
  keywords: ['doge-code', 'claude-code', 'cli', 'bun'],
  publishConfig: {
    access: 'public',
    provenance: true,
  },
}

await writeFile(
  join(releaseDir, 'package.json'),
  `${JSON.stringify(stripUndefined(publishPackage), null, 2)}\n`,
)

console.log(`Prepared ${packageName}@${version} in ${releaseDir}`)

function buildReleaseVersion(rawVersion, shortSha) {
  const normalizedBase = normalizeVersion(rawVersion)
  const suffix = sanitizeIdentifier(shortSha)
  if (normalizedBase.includes('-')) {
    return `${normalizedBase}.fork.${suffix}`
  }
  return `${normalizedBase}-fork.${suffix}`
}

function normalizeVersion(rawVersion) {
  const value = String(rawVersion).trim().replace(/^v/, '').toLowerCase()
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?$/)
  if (!match) {
    throw new Error(`Unsupported package version format: ${rawVersion}`)
  }
  const [, major, minor, patch, prerelease] = match
  if (!prerelease) {
    return `${major}.${minor}.${patch}`
  }
  return `${major}.${minor}.${patch}-${sanitizeIdentifier(prerelease)}`
}

function sanitizeIdentifier(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^0-9a-z.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getGitShortSha() {
  return execFromRoot('git', ['rev-parse', '--short=7', 'HEAD'])
}

function getRepositoryUrl() {
  const configured = process.env.PUBLISH_REPOSITORY_URL
  if (configured) {
    return configured
  }
  try {
    return execFromRoot('git', ['remote', 'get-url', 'origin'])
  } catch {
    return normalizeRepositoryField(rootPackage.repository?.url)
  }
}

function normalizeRepositoryField(value) {
  if (!value) {
    return undefined
  }
  return String(value).trim()
}

function execFromRoot(command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim()
}

function renderFallbackLicense() {
  return `This package is published from a fork of Anthropic Claude Code.\n\nRefer to the upstream license and usage terms before redistribution:\n- https://github.com/anthropics/claude-code/blob/main/LICENSE.md\n- https://www.anthropic.com/legal/commercial-terms\n`
}

function stripUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  )
}

async function copyIfPresent(from, to) {
  if (existsSync(from)) {
    await copyFile(from, to)
  }
}

async function copyTree(from, to) {
  if (existsSync(from)) {
    await cp(from, to, { recursive: true })
  }
}
