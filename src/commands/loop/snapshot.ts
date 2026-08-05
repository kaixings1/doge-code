/**
 * Loop Snapshot Manager (B3)
 *
 * 安全回滚 — 高风险操作前自动快照，失败一键回滚。
 *
 * 机制：
 * - git 项目：`git diff`（含暂存）保存为补丁文件 + untracked 文件副本
 * - 非 git 项目：工作区文件副本
 * - 快照保存在 <cwd>/.loop-snapshots/<id>/ 下
 *
 * 使用流程：
 *   1. createSnapshot()  → 循环开始前调用
 *   2. restoreSnapshot() → 失败时调用（反向应用补丁 + 恢复 untracked 副本）
 *   3. cleanupSnapshot() → 成功后调用（丢弃快照）
 */

import { execSync } from 'child_process'
import { mkdir, readFile, writeFile, copyFile, rm, readdir, stat } from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

/** 快照描述 */
export interface Snapshot {
  id: string
  label: string
  createdAt: string
  type: 'git' | 'file'
  /** 补丁文件绝对路径（git 项目） */
  patchPath: string | null
  /** 受跟踪文件的备份（相对路径 → 备份绝对路径） */
  tracked: Array<{ path: string; backupPath: string }>
  /** untracked 文件的备份（相对路径 → 备份绝对路径） */
  untracked: Array<{ path: string; backupPath: string }>
}

const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024 // 单文件备份上限 10MB

function run(cmd: string, cwd: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, stdout, stderr: '' }
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string }
    return {
      ok: false,
      stdout: (e.stdout ?? '').toString(),
      stderr: (e.stderr ?? '').toString(),
    }
  }
}

function isGitRepo(cwd: string): boolean {
  return run('git rev-parse --git-dir', cwd).ok
}

function snapshotDir(cwd: string): string {
  return path.join(cwd, '.loop-snapshots')
}

/** 创建快照。返回 null 表示无任何可备份内容。 */
export async function createSnapshot(cwd: string, label: string): Promise<Snapshot | null> {
  const id = `snap-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
  const dir = path.join(snapshotDir(cwd), id)
  await mkdir(dir, { recursive: true })

  const snapshot: Snapshot = {
    id,
    label,
    createdAt: new Date().toISOString(),
    type: 'file',
    patchPath: null,
    tracked: [],
    untracked: [],
  }

  const git = isGitRepo(cwd)

  // ─── git 项目：diff 补丁 + untracked 副本 ───
  if (git) {
    const diff = run('git diff --binary HEAD', cwd)
    if (diff.ok && diff.stdout.trim().length > 0) {
      const patchPath = path.join(dir, 'diff.patch')
      await writeFile(patchPath, diff.stdout, 'utf-8')
      snapshot.patchPath = patchPath
    }

    // untracked 文件（排除 .loop-snapshots 自身）
    const untracked = run('git ls-files --others --exclude-standard', cwd)
    if (untracked.ok) {
      for (const line of untracked.stdout.split('\n').map(l => l.trim()).filter(Boolean)) {
        if (line.startsWith('.loop-snapshots/')) continue
        const abs = path.resolve(cwd, line)
        const backupPath = path.join(dir, 'untracked', encodeURIComponent(line))
        await backupFile(abs, backupPath, line, snapshot.untracked)
      }
    }

    // 已跟踪但工作区有修改的文件（供 file 类型回滚参考，补丁主回滚）
    const modified = run('git diff --name-only HEAD', cwd)
    if (modified.ok) {
      for (const line of modified.stdout.split('\n').map(l => l.trim()).filter(Boolean)) {
        const abs = path.resolve(cwd, line)
        const backupPath = path.join(dir, 'tracked', encodeURIComponent(line))
        await backupFile(abs, backupPath, line, snapshot.tracked)
      }
    }

    if (snapshot.patchPath || snapshot.tracked.length > 0 || snapshot.untracked.length > 0) {
      snapshot.type = 'git'
      return snapshot
    }

    // 干净工作区 → 无备份内容
    await rm(dir, { recursive: true, force: true })
    return null
  }

  // ─── 非 git 项目：常见源码文件副本 ───
  const extRe = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|html|yml|yaml|py|go|rs|java|c|cpp|h)$/i
  try {
    const entries = await readdir(cwd, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isFile()) continue
      if (!extRe.test(ent.name)) continue
      const abs = path.join(cwd, ent.name)
      const backupPath = path.join(dir, 'tracked', encodeURIComponent(ent.name))
      await backupFile(abs, backupPath, ent.name, snapshot.tracked)
    }
  } catch {
    // 目录不可读 → 忽略
  }

  if (snapshot.tracked.length > 0) return snapshot

  await rm(dir, { recursive: true, force: true })
  return null
}

async function backupFile(
  abs: string,
  backupPath: string,
  relPath: string,
  target: Snapshot['tracked'],
): Promise<void> {
  try {
    const st = await stat(abs)
    if (!st.isFile() || st.size > MAX_BACKUP_FILE_SIZE) return
    await mkdir(path.dirname(backupPath), { recursive: true })
    await copyFile(abs, backupPath)
    target.push({ path: relPath, backupPath })
  } catch {
    // 文件不存在/不可读 → 跳过
  }
}

/** 回滚：恢复受跟踪改动 + untracked 文件 */
export async function restoreSnapshot(cwd: string, snapshot: Snapshot): Promise<boolean> {
  let ok = true

  // 恢复 tracked 备份（主要机制：快照时的完整文件内容，含未提交改动）
  for (const t of snapshot.tracked) {
    try {
      const abs = path.resolve(cwd, t.path)
      await mkdir(path.dirname(abs), { recursive: true })
      await copyFile(t.backupPath, abs)
    } catch {
      ok = false
    }
  }

  // 3. untracked：覆盖存在的（内容快照），删除新增的（无备份 = 快照后新建 → 回滚删除）
  const backedUp = new Set(snapshot.untracked.map(u => u.path))
  for (const u of snapshot.untracked) {
    try {
      const abs = path.resolve(cwd, u.path)
      await mkdir(path.dirname(abs), { recursive: true })
      await copyFile(u.backupPath, abs)
    } catch {
      ok = false
    }
  }
  try {
    await removeNewlyCreated(cwd, backedUp)
  } catch {
    ok = false
  }

  return ok
}

/**
 * 删除快照创建后新出现的 untracked 文件（回滚时清理副作用）。
 * 仅在 git 项目可用；非 git 项目跳过（保守策略）。
 */
async function removeNewlyCreated(cwd: string, backedUp: Set<string>): Promise<void> {
  const git = isGitRepo(cwd)
  if (!git) return
  const res = run('git ls-files --others --exclude-standard', cwd)
  if (!res.ok) return
  for (const line of res.stdout.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('.loop-snapshots/')) continue
    if (backedUp.has(line)) continue
    // 快照期间由 AI 新建的文件 → 回滚删除
    const abs = path.resolve(cwd, line)
    await rm(abs, { force: true })
  }
}

/** 成功后清理快照（丢弃备份） */
export async function cleanupSnapshot(snapshot: Snapshot): Promise<void> {
  const dir = path.dirname(snapshot.patchPath ?? snapshot.tracked[0]?.backupPath ?? '')
  if (!dir) return
  try {
    const root = path.join(dir, '..') // .loop-snapshots/<id> 的上级目录处理
    const snapDir = path.resolve(root)
    await rm(snapDir, { recursive: true, force: true })
  } catch {
    // 忽略清理失败
  }
}

/** 删除某个快照目录（按 id） */
export async function removeSnapshotDir(cwd: string, id: string): Promise<void> {
  await rm(path.join(snapshotDir(cwd), id), { recursive: true, force: true })
}

/** 列出历史快照 */
export async function listSnapshots(cwd: string): Promise<Array<{ id: string; label?: string; createdAt?: string }>> {
  try {
    const dir = snapshotDir(cwd)
    const entries = await readdir(dir, { withFileTypes: true })
    const result: Array<{ id: string; label?: string; createdAt?: string }> = []
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith('snap-')) continue
      result.push({ id: ent.name })
    }
    return result.sort((a, b) => b.id.localeCompare(a.id))
  } catch {
    return []
  }
}
