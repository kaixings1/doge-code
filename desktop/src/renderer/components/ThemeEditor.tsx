import React, { useCallback, useState } from 'react'
import type { ThemeColors } from '../theme.js'

export function ThemeEditor({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [bg, setBg] = useState('#1a1a2e')
  const [fg, setFg] = useState(c.text || '#eaeaea')
  const [accent, setAccent] = useState(c.accent || '#e94560')

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ bg, fg, accent }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'theme.json'
    a.click()
  }, [bg, fg, accent])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ color: c.accent, fontWeight: 600, marginBottom: '6px' }}>Theme Editor</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: c.text, fontSize: '10px', width: '80px' }}>Background</span>
          <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ width: '30px', height: '20px', border: 'none', cursor: 'pointer' }} />
          <span style={{ color: c.textFaint, fontSize: '9px' }}>{bg}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: c.text, fontSize: '10px', width: '80px' }}>Foreground</span>
          <input type="color" value={fg} onChange={e => setFg(e.target.value)} style={{ width: '30px', height: '20px', border: 'none', cursor: 'pointer' }} />
          <span style={{ color: c.textFaint, fontSize: '9px' }}>{fg}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: c.text, fontSize: '10px', width: '80px' }}>Accent</span>
          <input type="color" value={accent} onChange={e => setAccent(e.target.value)} style={{ width: '30px', height: '20px', border: 'none', cursor: 'pointer' }} />
          <span style={{ color: c.textFaint, fontSize: '9px' }}>{accent}</span>
        </div>
        <button onClick={handleExport} style={{ marginTop: '6px', padding: '4px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', fontSize: '9px', cursor: 'pointer' }}>Export Theme</button>
      </div>
    </div>
  )
}
