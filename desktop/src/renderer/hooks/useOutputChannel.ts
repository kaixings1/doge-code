/**
 * useOutputChannel — 输出通道状态管理 Hook
 *
 * 封装 OutputChannelManager，提供 channels / activeChannel / autoScroll 状态，
 * 以及 appendToChannel 等写入接口。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { OutputChannelManager, type OutputEntry } from '../utils/OutputChannelManager.js'

export interface UseOutputChannelOptions {
  channelIds?: Array<{ id: string; name: string }>
}

export interface UseOutputChannelResult {
  channels: ReturnType<OutputChannelManager['getChannels']>
  activeChannelId: string
  setActiveChannelId: (id: string) => void
  autoScroll: boolean
  setAutoScroll: (value: boolean) => void
  appendToChannel: (channelId: string, message: string, level?: OutputEntry['level']) => void
  clearChannel: (channelId: string) => void
  clearAll: () => void
  entries: OutputEntry[]
}

export function useOutputChannel(options: UseOutputChannelOptions = {}): UseOutputChannelResult {
  const manager = useMemo(() => new OutputChannelManager({ channels: options.channelIds }), [options.channelIds])
  const [activeChannelId, setActiveChannelId] = useState<string>(() => manager.getChannels()[0]?.id || '')
  const [autoScroll, setAutoScroll] = useState(true)
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsubscribe = manager.subscribe(() => {
      setTick(t => t + 1)
    })
    return unsubscribe
  }, [manager])

  const channels = useMemo(() => manager.getChannels(), [manager])
  const entries = useMemo(() => manager.getEntries(activeChannelId), [manager, activeChannelId])

  const appendToChannel = useCallback((channelId: string, message: string, level: OutputEntry['level'] = 'info') => {
    manager.append(channelId, message, level)
  }, [manager])

  const clearChannel = useCallback((channelId: string) => {
    manager.clear(channelId)
  }, [manager])

  const clearAll = useCallback(() => {
    manager.clearAll()
  }, [manager])

  return {
    channels,
    activeChannelId,
    setActiveChannelId,
    autoScroll,
    setAutoScroll,
    appendToChannel,
    clearChannel,
    clearAll,
    entries,
  }
}