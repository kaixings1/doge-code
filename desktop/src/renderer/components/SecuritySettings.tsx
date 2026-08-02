import React, { useCallback, useState } from 'react'
import type { ThemeColors } from '../theme.js'

export function SecuritySettings({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [enabled, setEnabled] = useState(false)
  const api = (window as any).dogeAPI as Record<string, any>

  const handleGenerate = useCallback(async () => {
    const result = await api.twoFAGenerate()
    if (result?.secret) setSecret(result.secret)
  }, [api])

  const handleVerify = useCallback(async () => {
    const result = await api.twoFAVerify({ secret, code })
    if (result?.valid) setEnabled(true)
  }, [api, secret, code])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ color: c.accent, fontWeight: 600, marginBottom: '6px' }}>Security Settings</div>
      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: c.text, fontSize: '10px', marginBottom: '4px' }}>Two-Factor Authentication</div>
        {!secret ? (
          <button onClick={handleGenerate} style={{ padding: '3px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px' }}>Generate Secret</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: c.textFaint, fontSize: '9px' }}>Secret: {secret.slice(0, 8)}...</div>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Enter 6-digit code" style={{ padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
            <button onClick={handleVerify} style={{ padding: '3px 8px', border: 'none', borderRadius: '2px', background: enabled ? '#4CAF50' : c.accent, color: enabled ? '#fff' : '#000', cursor: 'pointer', fontSize: '9px' }}>
              {enabled ? 'Verified!' : 'Verify & Enable'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
