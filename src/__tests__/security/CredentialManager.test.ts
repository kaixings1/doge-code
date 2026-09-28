import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CredentialManager } from '../../security/CredentialManager'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('CredentialManager', () => {
  let storageFile: string
  let manager: CredentialManager

  beforeEach(async () => {
    storageFile = join(tmpdir(), `cred-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    manager = new CredentialManager(storageFile, 'test-encryption-key-32chars!!')
    await manager.initialize()
  })

  afterEach(async () => {
    try { await fs.unlink(storageFile) } catch { /* ignore */ }
  })

  describe('setCredential / getCredential', () => {
    it('stores and retrieves a credential', async () => {
      await manager.setCredential({
        id: 'cred-1',
        type: 'api_key',
        name: 'Test API Key',
        value: 'secret-value',
      })
      expect(manager.getCredential('cred-1')).toBe('secret-value')
    })

    it('returns null for non-existent credential', () => {
      expect(manager.getCredential('nonexistent')).toBeNull()
    })

    it('returns null for expired credential', async () => {
      await manager.setCredential({
        id: 'cred-exp',
        type: 'token',
        name: 'Expired Token',
        value: 'expired-value',
        expiresAt: new Date(Date.now() - 1000),
      })
      expect(manager.getCredential('cred-exp')).toBeNull()
    })

    it('preserves credential metadata', async () => {
      await manager.setCredential({
        id: 'cred-meta',
        type: 'password',
        name: 'My Password',
        value: 'pwd123',
        metadata: { service: 'github' },
      })
      const info = manager.getCredentialInfo('cred-meta')
      expect(info?.metadata).toEqual({ service: 'github' })
      expect(info?.type).toBe('password')
    })
  })

  describe('deleteCredential', () => {
    it('deletes existing credential', async () => {
      await manager.setCredential({
        id: 'cred-del',
        type: 'api_key',
        name: 'Delete Me',
        value: 'val',
      })
      expect(manager.deleteCredential('cred-del')).toBe(true)
      expect(manager.getCredential('cred-del')).toBeNull()
    })

    it('returns false for non-existent credential', () => {
      expect(manager.deleteCredential('nonexistent')).toBe(false)
    })
  })

  describe('listCredentials', () => {
    it('lists all credentials without values', async () => {
      await manager.setCredential({ id: 'c1', type: 'api_key', name: 'Key1', value: 'v1' })
      await manager.setCredential({ id: 'c2', type: 'token', name: 'Token2', value: 'v2' })
      const list = manager.listCredentials()
      expect(list).toHaveLength(2)
      expect(list.map(c => c.id).sort()).toEqual(['c1', 'c2'])
      expect(list.every(c => 'value' in c === false)).toBe(true)
    })
  })

  describe('persistence', () => {
    it('persists credentials across instances', async () => {
      await manager.setCredential({
        id: 'persist-1',
        type: 'api_key',
        name: 'Persistent',
        value: 'persist-val',
      })

      const manager2 = new CredentialManager(storageFile, 'test-encryption-key-32chars!!')
      await manager2.initialize()
      expect(manager2.getCredential('persist-1')).toBe('persist-val')
    })

    it('handles missing storage file gracefully', async () => {
      const emptyManager = new CredentialManager(storageFile + '.nonexistent', 'test-encryption-key-32chars!!')
      await expect(emptyManager.initialize()).resolves.toBeUndefined()
      expect(emptyManager.getCredential('any')).toBeNull()
    })
  })
})
