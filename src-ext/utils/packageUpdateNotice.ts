import axios from 'axios'
import { stringWidth } from '../ink/stringWidth.js'
import { truncate } from './format.js'
import { logForDebugging } from './debug.js'

const REGISTRY_URL = 'https://registry.npmjs.org'
const UPDATE_CHECK_TIMEOUT_MS = 4000

export type PackageUpdateInfo = {
  packageName: string
  latestVersion: string
  installCommand: string
}

let cachedPackageUpdateInfo: PackageUpdateInfo | null | undefined
let packageUpdateInfoPromise: Promise<PackageUpdateInfo | null> | null = null

function getRuntimePackageName(): string {
  return process.env.CLAUDE_CODE_PACKAGE_NAME?.trim() || MACRO.PACKAGE_URL
}

function buildInstallCommand(packageName: string): string {
  return `npm i -g ${packageName}@latest`
}

export function getPackageUpdateInfoSync():
  | PackageUpdateInfo
  | null
  | undefined {
  return cachedPackageUpdateInfo
}

export async function prefetchPackageUpdateInfo(): Promise<PackageUpdateInfo | null> {
  if (cachedPackageUpdateInfo !== undefined) {
    return cachedPackageUpdateInfo
  }

  if (packageUpdateInfoPromise) {
    return packageUpdateInfoPromise
  }

  const packageName = getRuntimePackageName()
  if (!packageName) {
    cachedPackageUpdateInfo = null
    return null
  }

  packageUpdateInfoPromise = (async () => {
    try {
      const response = await axios.get(
        `${REGISTRY_URL}/${encodeURIComponent(packageName)}`,
        {
          timeout: UPDATE_CHECK_TIMEOUT_MS,
          validateStatus: status => status === 200 || status === 404,
        },
      )

      if (response.status !== 200) {
        cachedPackageUpdateInfo = null
        return null
      }

      const latestVersion = response.data?.['dist-tags']?.latest
      if (
        typeof latestVersion !== 'string' ||
        !latestVersion.trim() ||
        latestVersion === MACRO.VERSION
      ) {
        cachedPackageUpdateInfo = null
        return null
      }

      cachedPackageUpdateInfo = {
        packageName,
        latestVersion,
        installCommand: buildInstallCommand(packageName),
      }
      return cachedPackageUpdateInfo
    } catch (error) {
      logForDebugging(`package update notice check failed: ${error}`)
      cachedPackageUpdateInfo = null
      return null
    } finally {
      packageUpdateInfoPromise = null
    }
  })()

  return packageUpdateInfoPromise
}

export function formatPackageUpdateNotice(
  info: PackageUpdateInfo,
  maxWidth: number,
): string {
  const preferredNotice = `New version available · ${info.installCommand}`
  const candidates = [
    preferredNotice,
    `New version available: ${info.latestVersion} · ${info.installCommand}`,
  ]

  const exactMatch = candidates.find(text => stringWidth(text) <= maxWidth)
  if (exactMatch) {
    return exactMatch
  }

  return truncate(preferredNotice, Math.max(maxWidth, 12))
}
