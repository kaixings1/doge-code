import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

export function ThemeMarketplace({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [themes, setThemes] = useState<Array<{ id: string; name: string; author: string; builtIn?: boolean }>>([])
  const api = (window as any).dogeAPI as Record<string, any>

  const loadThemes = useCallback(async () => {
    const result = await api.themeMarketplaceList()
    if (result?.themes) setThemes(result.themes)
  }, [api])

  useEffect(() => { loadThemes() }, [loadThemes])

  const handleInstall = useCallback(async (id: string) => {
    await api.themeInstall({ themeId: id })
    loadThemes()
  }, [api, loadThemes])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ color: c.accent, fontWeight: 600, marginBottom: '6px' }}>Theme Marketplace</div>
      {themes.map(t => (
        <div key={t.id} style={{ padding: '6px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: c.text, fontSize: '10px' }}>{t.name}</div>
            <div style={{ color: c.textFaint, fontSize: '8px' }}>by {t.author} {t.builtIn && '(Built-in)'}</div>
          </div>
          {!t.builtIn && <button onClick={() => handleInstall(t.id)} style={{ padding: '2px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', fontSize: '9px', cursor: 'pointer' }}>Install</button>}
        </div>
      ))}
    </div>
  )
}
