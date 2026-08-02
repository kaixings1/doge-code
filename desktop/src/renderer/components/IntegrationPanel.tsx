import React, { useCallback, useState } from 'react'
import type { ThemeColors } from '../theme.js'

type Tab = 'slack' | 'discord' | 'jira' | 'notion' | 'figma'

export function IntegrationPanel({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [tab, setTab] = useState<Tab>('slack')
  const [token, setToken] = useState('')
  const [connected, setConnected] = useState(false)
  const api = (window as any).dogeAPI as Record<string, any>

  const handleConnect = useCallback(async () => {
    if (!token.trim()) return
    let result: any
    switch (tab) {
      case 'slack': result = await api.slackAuth({ token: token.trim() }); break
      case 'discord': result = await api.discordAuth({ token: token.trim() }); break
      case 'figma': result = await api.figmaAuth({ token: token.trim() }); break
      case 'notion': result = await api.notionAuth({ token: token.trim() }); break
      case 'jira': result = await api.jiraAuth({ domain: '', email: '', apiToken: token.trim() }); break
    }
    if (result?.success) setConnected(true)
  }, [tab, token, api])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', borderBottom: `1px solid ${c.border}`, paddingBottom: '4px' }}>
        {(['slack', 'discord', 'jira', 'notion', 'figma'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '3px 8px', border: 'none', borderRadius: '2px', background: tab === t ? c.accent : 'transparent', color: tab === t ? '#000' : c.textMuted, cursor: 'pointer', fontSize: '9px', textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>
      {connected ? (
        <div style={{ padding: '8px', textAlign: 'center' }}>
          <div style={{ color: '#4CAF50', fontSize: '12px', marginBottom: '4px' }}>✓ Connected to {tab}</div>
          <button onClick={() => setConnected(false)} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px' }}>Disconnect</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <input value={token} onChange={e => setToken(e.target.value)} placeholder={`${tab} token...`} style={{ padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '10px', outline: 'none' }} />
          <button onClick={handleConnect} style={{ padding: '4px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px' }}>Connect to {tab}</button>
        </div>
      )}
    </div>
  )
}
