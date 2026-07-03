// Backfill sessions - retrieve and restore historical session data
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

interface SessionMeta {
 id?: string
 title?: string
 createdAt?: string | number
 updatedAt?: string | number
 model?: string
 tags?: string[]
}

interface SessionInfo {
 name: string
 meta: SessionMeta
 isValid: boolean
 hasMessages: boolean
 sizeBytes: number
}

const call: LocalCommandCall = async (args: string, context) => {
 const _ctx = context || {}
 const action = (args || '').trim().toLowerCase()

 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: ['help content'].join('/n'), }
 }
 return { type: 'text' as const, value: 'done' };
};

const backfillSessions = { type: 'local', name: 'backfill-sessions', description: 'Scan sessions', supportsNonInteractive: true, load: () => Promise.resolve({ call }), } satisfies Command

export default backfillSessions