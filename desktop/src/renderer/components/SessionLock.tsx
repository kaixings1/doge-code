import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

export function SessionLock({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [timeout, setTimeout_] = useState(5)
  const api = (window as any).dogeAPI as Record<string, any>

  const checkLock = useCallback(async () => {
    const result = await api.sessionIsLocked()
    setLocked(result?.locked || false)
  }, [api])

  useEffect(() => { checkLock() }, [checkLock])

  const handleLock = useCallback(async () => {
    await api.sessionLock()
    setLocked(true)
  }, [api])

  const handleUnlock = useCallback(async () => {
    await api.sessionUnlock({ password: password || undefined })
    setLocked(false)
    setPassword('')
  }, [api, password])

  if (locked) {
    return (
      <div style={{ fontSize: '11px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '24px' }}>🔒</div>
        <div style={{ color: c.text, fontSize: '12px', fontWeight: 600 }}>Session Locked</div>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" style={{ padding: '4px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
        <button onClick={handleUnlock} style={{ padding: '4px 16px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', fontSize: '10px', cursor: 'pointer' }}>Unlock</button>
      </div>
    )
  }

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ color: c.accent, fontWeight: 600, marginBottom: '6px' }}>Session Lock</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ color: c.text, fontSize: '10px' }}>Timeout (min):</span>
        <input type="number" value={timeout} onChange={e => setTimeout_(Number(e.target.value))} min={1} max={60} style={{ width: '50px', padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px' }} />
      </div>
      <button onClick={handleLock} style={{ padding: '4px 12px', border: 'none', borderRadius: '3px', background: '#FF6B6B', color: '#fff', fontSize: '10px', cursor: 'pointer' }}>Lock Now</button>
    </div>
  )
}
