/**
 * RecordingPanel - Session Recording Panel
 *
 * Features:
 * - Start/stop recording collaboration sessions
 * - Display recording status and event count
 * - List active recordings
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface Recording {
  roomId: string
  name: string
  startTime: number
  eventCount: number
}

export function RecordingPanel({ theme, roomId }: { theme: ThemeColors; roomId: string }): JSX.Element {
  const c = theme
  const [isRecording, setIsRecording] = useState(false)
  const [eventCount, setEventCount] = useState(0)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const api = (window as any).dogeAPI as Record<string, any>

  const loadRecordings = useCallback(async () => {
    const result = await api.recordingList()
    if (result?.recordings) setRecordings(result.recordings)
  }, [api])

  useEffect(() => { loadRecordings() }, [loadRecordings])

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(async () => {
      const result = await api.recordingList()
      const current = result?.recordings?.find((r: Recording) => r.roomId === roomId)
      if (current) setEventCount(current.eventCount)
    }, 2000)
    return () => clearInterval(timer)
  }, [isRecording, roomId, api])

  const handleStart = useCallback(async () => {
    await api.recordingStart({ roomId })
    setIsRecording(true)
    loadRecordings()
  }, [roomId, api, loadRecordings])

  const handleStop = useCallback(async () => {
    await api.recordingStop({ roomId })
    setIsRecording(false)
    setEventCount(0)
    loadRecordings()
  }, [roomId, api, loadRecordings])

  const btnStyle: React.CSSProperties = {
    padding: '2px 8px',
    border: 'none',
    borderRadius: '2px',
    fontSize: '9px',
    cursor: 'pointer',
  }

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: c.accent, fontWeight: 600 }}>Session Recording</span>
        {isRecording ? (
          <button onClick={handleStop} style={{ ...btnStyle, background: '#FF6B6B', color: '#ffffff' }}>
            Stop ({eventCount})
          </button>
        ) : (
          <button onClick={handleStart} style={{ ...btnStyle, background: c.accent, color: '#000000' }}>
            Record
          </button>
        )}
      </div>

      {isRecording && (
        <div style={{ padding: '6px', background: '#FF6B6B22', border: '1px solid #FF6B6B', borderRadius: '3px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF6B6B' }} />
          <span style={{ color: '#FF6B6B', fontSize: '10px' }}>Recording... {eventCount} events</span>
        </div>
      )}

      <div style={{ color: c.textFaint, fontSize: '9px', marginBottom: '4px' }}>Active recordings ({recordings.length}):</div>
      {recordings.length === 0 ? (
        <div style={{ padding: '8px', textAlign: 'center', color: c.textFaint, fontSize: '9px' }}>No recordings</div>
      ) : recordings.map(r => (
        <div key={r.roomId} style={{ padding: '4px 6px', borderBottom: `1px solid ${c.borderSubtle}`, borderRadius: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
            <span style={{ color: c.text }}>{r.name}</span>
            <span style={{ color: c.textFaint }}>{r.eventCount} events</span>
          </div>
        </div>
      ))}
    </div>
  )
}
