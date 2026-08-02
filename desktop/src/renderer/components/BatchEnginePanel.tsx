/**
 * BatchEnginePanel — 后端批量处理面板
 *
 * 使用主进程 BatchEngine 进行批量文件处理：
 * - 目录扫描 + 文件过滤
 * - 并发执行（主进程控制）
 * - 实时进度推送
 * - 取消/清理
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { ThemeColors } from '../theme.js'

interface BatchProgress {
  batchId: string
  fileId: string
  fileName: string
  status: string
  progress: number
  totalFiles: number
  completedFiles: number
  failedFiles: number
  error?: string
  output?: string
}

interface BatchComplete {
  batchId: string
  name: string
  status: string
  completedCount: number
  failedCount: number
  totalFiles: number
  durationMs: number
}

export function BatchEnginePanel({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [dirPath, setDirPath] = useState('')
  const [extensions, setExtensions] = useState('.ts,.tsx,.js,.jsx')
  const [scannedFiles, setScannedFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [batchId, setBatchId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [results, setResults] = useState<BatchProgress[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const [concurrency, setConcurrency] = useState(3)
  const apiRef = useRef((window as any).dogeAPI as Record<string, any>)

  // 监听进度
  useEffect(() => {
    const api = apiRef.current
    if (!api?.onBatchProgress) return
    const unsub = api.onBatchProgress((p: BatchProgress) => {
      setProgress(p)
      setResults(prev => {
        const existing = prev.findIndex(r => r.fileId === p.fileId)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = p
          return updated
        }
        return [...prev, p]
      })
    })
    return unsub
  }, [])

  // 监听完成
  useEffect(() => {
    const api = apiRef.current
    if (!api?.onBatchComplete) return
    const unsub = api.onBatchComplete((e: BatchComplete) => {
      setIsRunning(false)
      setBatchId(null)
      setError(e.status === 'cancelled' ? '任务已取消' : `任务完成: ${e.completedCount} 成功, ${e.failedCount} 失败 (${(e.durationMs / 1000).toFixed(1)}s)`)
    })
    return unsub
  }, [])

  const handleScan = useCallback(async () => {
    if (!dirPath.trim()) return
    setIsScanning(true)
    setError('')
    setScannedFiles([])
    setSelectedFiles(new Set())

    try {
      const api = apiRef.current
      const exts = extensions.split(',').map(e => e.trim()).filter(Boolean)
      const result = await api.batchScanFiles({
        dirPath: dirPath.trim(),
        extensions: exts.length > 0 ? exts : undefined,
        maxFiles: 500,
      })
      if (result?.success && result?.files) {
        setScannedFiles(result.files)
        setSelectedFiles(new Set(result.files))
      } else {
        setError(result?.error || '扫描失败')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '扫描出错')
    } finally {
      setIsScanning(false)
    }
  }, [dirPath, extensions])

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(prev => {
      if (prev.size === scannedFiles.length) return new Set()
      return new Set(scannedFiles)
    })
  }, [scannedFiles])

  const toggleFile = useCallback((filePath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const handleStart = useCallback(async () => {
    if (selectedFiles.size === 0) return
    setError('')
    setIsRunning(true)
    setResults([])
    setProgress(null)

    try {
      const api = apiRef.current
      const files = Array.from(selectedFiles).map(f => ({ filePath: f }))
      const result = await api.batchStart({
        workflowId: 'default',
        workflowName: '批量文件处理',
        files,
        config: { concurrency, timeout: 120000 },
      })
      if (result?.success && result?.batchId) {
        setBatchId(result.batchId)
      } else {
        setIsRunning(false)
        setError(result?.error || '启动失败')
      }
    } catch (e: unknown) {
      setIsRunning(false)
      setError(e instanceof Error ? e.message : '启动出错')
    }
  }, [selectedFiles, concurrency])

  const handleCancel = useCallback(async () => {
    if (!batchId) return
    const api = apiRef.current
    await api.batchCancel(batchId)
    setIsRunning(false)
  }, [batchId])

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', gap: '8px' }}>
      {/* 配置区 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <input value={dirPath} onChange={e => setDirPath(e.target.value)} placeholder="要扫描的目录路径" style={{ flex: 1, padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
        <input value={extensions} onChange={e => setExtensions(e.target.value)} placeholder="扩展名" style={{ width: '120px', padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
        <button onClick={handleScan} disabled={isScanning || isRunning} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>
          {isScanning ? '扫描中...' : '扫描'}
        </button>
      </div>

      {/* 并发数配置 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: c.textMuted, fontSize: '9px' }}>并发数:</span>
        <input type="range" min="1" max="10" value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} disabled={isRunning} style={{ flex: 1 }} />
        <span style={{ color: c.text, fontSize: '10px', fontWeight: 600, width: '20px', textAlign: 'center' }}>{concurrency}</span>
      </div>

      {error && <div style={{ padding: '4px 6px', background: error.includes('完成') ? `${c.accent}22` : `${c.errorText}22`, color: error.includes('完成') ? c.accent : c.errorText, borderRadius: '3px', fontSize: '9px' }}>{error}</div>}

      {/* 进度条 */}
      {progress && isRunning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
            <span style={{ color: c.textMuted }}>{progress.fileName}</span>
            <span style={{ color: c.accent }}>{progress.progress}%</span>
          </div>
          <div style={{ height: '4px', background: c.bgAlt, borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${progress.progress}%`, height: '100%', background: c.accent, borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '8px', color: c.textFaint }}>
            {progress.completedFiles} 完成 / {progress.failedFiles} 失败 / {progress.totalFiles} 总计
          </div>
        </div>
      )}

      {/* 文件列表 */}
      {scannedFiles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ color: c.textMuted, fontSize: '9px' }}>已选择 {selectedFiles.size}/{scannedFiles.length} 个文件</span>
            <button onClick={handleSelectAll} style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '8px' }}>
              {selectedFiles.size === scannedFiles.length ? '取消全选' : '全选'}
            </button>
          </div>
          {scannedFiles.map(file => (
            <label key={file} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', cursor: 'pointer', borderRadius: '2px', background: selectedFiles.has(file) ? `${c.accent}08` : 'transparent' }}>
              <input type="checkbox" checked={selectedFiles.has(file)} onChange={() => toggleFile(file)} disabled={isRunning} style={{ margin: 0 }} />
              <span style={{ color: c.textFaint, fontSize: '9px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
            </label>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={handleStart} disabled={isRunning || selectedFiles.size === 0} style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '3px', background: isRunning ? c.bgAlt : c.accent, color: isRunning ? c.textFaint : '#000', cursor: isRunning ? 'default' : 'pointer', fontSize: '10px', fontWeight: 600 }}>
          {isRunning ? '执行中...' : `开始处理 (${selectedFiles.size} 文件)`}
        </button>
        {isRunning && (
          <button onClick={handleCancel} style={{ padding: '6px 10px', border: `1px solid ${c.errorText}`, borderRadius: '3px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '10px' }}>
            取消
          </button>
        )}
      </div>

      {/* 结果列表 */}
      {results.length > 0 && !isRunning && (
        <div style={{ maxHeight: '120px', overflowY: 'auto', borderTop: `1px solid ${c.borderSubtle}`, paddingTop: '4px' }}>
          <div style={{ fontSize: '9px', color: c.textMuted, marginBottom: '4px' }}>执行结果 ({results.length})</div>
          {results.map(r => (
            <div key={r.fileId} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: '9px' }}>
              <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{r.fileName}</span>
              <span style={{ color: r.status === 'completed' ? '#81C784' : r.status === 'failed' ? '#FF6B6B' : c.textMuted }}>
                {r.status === 'completed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️'}
                {r.error ? ` ${r.error}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
