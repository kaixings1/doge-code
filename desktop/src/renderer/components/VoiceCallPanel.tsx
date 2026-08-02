import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'

export function VoiceCallPanel({ theme, roomId, userId }: { theme: ThemeColors; roomId: string; userId: string }): JSX.Element {
  const c = theme
  const [inCall, setInCall] = useState(false)
  const [muted, setMuted] = useState(false)
  const [participants, setParticipants] = useState<Array<{ id: string; name: string; muted: boolean }>>([])
  const apiRef = useRef((window as any).dogeAPI as Record<string, any>)

  useEffect(() => {
    const api = apiRef.current
    if (!api?.onVoiceEvent) return
    const unsub = api.onVoiceEvent((event: { type: string; userId: string; muted?: boolean }) => {
      if (event.type === 'started') {
        setInCall(true)
        setParticipants(prev => [...prev.filter(p => p.id !== event.userId), { id: event.userId, name: event.userId, muted: false }])
      } else if (event.type === 'stopped') {
        setParticipants(prev => prev.filter(p => p.id !== event.userId))
      } else if (event.type === 'muted') {
        setParticipants(prev => prev.map(p => p.id === event.userId ? { ...p, muted: event.muted! } : p))
      }
    })
    return unsub
  }, [])

  const handleStart = useCallback(async () => {
    await apiRef.current.voiceStart({ roomId, userId })
    setInCall(true)
  }, [roomId, userId])

  const handleStop = useCallback(async () => {
    await apiRef.current.voiceStop({ roomId, userId })
    setInCall(false)
    setParticipants([])
  }, [roomId, userId])

  const handleMute = useCallback(async () => {
    const newMuted = !muted
    await apiRef.current.voiceMute({ roomId, userId, muted: newMuted })
    setMuted(newMuted)
  }, [roomId, userId, muted])

  return (
    <div style={{ fontSize: '11px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: c.accent, fontWeight: 600 }}>Voice Call</span>
        {!inCall ? (
          <button onClick={handleStart} style={{ padding: '4px 12px', border: 'none', borderRadius: '3px', background: '#4CAF50', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>Start</button>
        ) : (
          <button onClick={handleStop} style={{ padding: '4px 12px', border: 'none', borderRadius: '3px', background: '#FF6B6B', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>End</button>
        )}
      </div>
      {inCall && (
        <>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleMute} style={{ flex: 1, padding: '4px', border: 'none', borderRadius: '2px', background: muted ? '#FF6B6B' : c.accent, color: muted ? '#fff' : '#000', cursor: 'pointer', fontSize: '9px' }}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <div style={{ color: c.textFaint, fontSize: '9px' }}>In call ({participants.length}):</div>
          {participants.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 0' }}>
              <span style={{ color: c.text, fontSize: '10px' }}>{p.name}</span>
              {p.muted && <span style={{ color: '#FF6B6B', fontSize: '8px' }}>MUTED</span>}
            </div>
          ))}
        </>
      )}
      {!inCall && <div style={{ color: c.textFaint, fontSize: '9px', textAlign: 'center', padding: '8px' }}>No active call</div>}
    </div>
  )
}
