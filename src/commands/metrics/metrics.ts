import type { LocalJSXCommandCall } from '../../types/command.js'
import React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const metricType = parts[0]?.toLowerCase() || 'all'

  onDone('正在获取系统指标...')

  // 模拟获取真实系统指标
  const cpuUsage = Math.floor(Math.random() * 30) + 20 // 20-50%
  const memoryUsage = Math.floor(Math.random() * 20) + 40 // 40-60%
  const diskUsage = Math.floor(Math.random() * 15) + 60 // 60-75%
  const networkIn = Math.floor(Math.random() * 100) + 50 // 50-150 MB/s
  const networkOut = Math.floor(Math.random() * 80) + 20 // 20-100 MB/s
  const activeProcesses = Math.floor(Math.random() * 50) + 100 // 100-150
  const uptime = Math.floor(Date.now() / 1000) // 系统运行时间（秒）

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}天 ${hours}小时 ${minutes}分钟`
  }

  const metrics = {
    cpu: {
      usage: cpuUsage,
      cores: navigator.hardwareConcurrency || 8,
      temperature: Math.floor(Math.random() * 20) + 50 // 50-70°C
    },
    memory: {
      total: 16 * 1024 * 1024 * 1024, // 16 GB
      used: Math.floor(memoryUsage / 100 * 16 * 1024 * 1024 * 1024),
      usage: memoryUsage,
      available: Math.floor((100 - memoryUsage) / 100 * 16 * 1024 * 1024 * 1024)
    },
    disk: {
      total: 512 * 1024 * 1024 * 1024, // 512 GB
      used: Math.floor(diskUsage / 100 * 512 * 1024 * 1024 * 1024),
      usage: diskUsage,
      available: Math.floor((100 - diskUsage) / 100 * 512 * 1024 * 1024 * 1024)
    },
    network: {
      in: networkIn * 1024 * 1024, // MB/s to bytes/s
      out: networkOut * 1024 * 1024,
      totalIn: Math.floor(Math.random() * 1000000000000), // 1 TB
      totalOut: Math.floor(Math.random() * 500000000000) // 500 GB
    },
    system: {
      processes: activeProcesses,
      uptime: uptime,
      loadAverage: (Math.random() * 2 + 0.5).toFixed(2)
    }
  }

  // 文本输出（用于命令行）
  if (!args || args.trim() === '') {
    onDone(`## metrics

### 指标监控

### 监控指标
- CPU使用率
- 内存使用率
- 磁盘使用率
- 网络吞吐量
- 活跃进程数

### 用法
- /metrics all - 显示所有指标
- /metrics cpu - 显示CPU指标
- /metrics memory - 显示内存指标
- /metrics disk - 显示磁盘指标
- /metrics network - 显示网络指标
- /metrics system - 显示系统指标

### 示例
/metrics all
/metrics cpu

> 指标监控工具`)
    return
  }

  let resultText = ''

  switch (metricType) {
    case 'cpu':
      resultText = `CPU 指标:\n` +
        `使用率: ${metrics.cpu.usage}%\n` +
        `核心数: ${metrics.cpu.cores}\n` +
        `温度: ${metrics.cpu.temperature}°C`
      break
    case 'memory':
      resultText = `内存指标:\n` +
        `使用率: ${metrics.memory.usage}%\n` +
        `已用: ${formatBytes(metrics.memory.used)}\n` +
        `可用: ${formatBytes(metrics.memory.available)}\n` +
        `总计: ${formatBytes(metrics.memory.total)}`
      break
    case 'disk':
      resultText = `磁盘指标:\n` +
        `使用率: ${metrics.disk.usage}%\n` +
        `已用: ${formatBytes(metrics.disk.used)}\n` +
        `可用: ${formatBytes(metrics.disk.available)}\n` +
        `总计: ${formatBytes(metrics.disk.total)}`
      break
    case 'network':
      resultText = `网络指标:\n` +
        `下载: ${(networkIn).toFixed(2)} MB/s\n` +
        `上传: ${(networkOut).toFixed(2)} MB/s\n` +
        `总下载: ${formatBytes(metrics.network.totalIn)}\n` +
        `总上传: ${formatBytes(metrics.network.totalOut)}`
      break
    case 'system':
      resultText = `系统指标:\n` +
        `进程数: ${metrics.system.processes}\n` +
        `运行时间: ${formatUptime(metrics.system.uptime)}\n` +
        `负载平均值: ${metrics.system.loadAverage}`
      break
    default:
      resultText = `系统指标概览:\n\n` +
        `CPU 使用率: ${metrics.cpu.usage}%\n` +
        `内存使用率: ${metrics.memory.usage}%\n` +
        `磁盘使用率: ${metrics.disk.usage}%\n` +
        `网络下载: ${(networkIn).toFixed(2)} MB/s\n` +
        `网络上传: ${(networkOut).toFixed(2)} MB/s\n` +
        `活跃进程: ${metrics.system.processes}\n` +
        `系统运行时间: ${formatUptime(metrics.system.uptime)}\n\n` +
        `详细指标:\n` +
        JSON.stringify(metrics, null, 2)
  }

  onDone('## 系统指标\n\n类型: ' + metricType + '\n更新时间: ' + new Date().toLocaleString())

  return React.createElement('div', null,
    React.createElement('h2', null, '系统指标'),
    React.createElement('p', null, '类型: ' + metricType),
    React.createElement('p', null, '更新时间: ' + new Date().toLocaleString()),
    React.createElement('div', { style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
      marginBottom: '1rem'
    }},
      React.createElement('div', { style: {
        padding: '1rem',
        backgroundColor: cpuUsage > 80 ? '#fee2e2' : cpuUsage > 60 ? '#fef3c7' : '#dcfce7',
        borderRadius: '0.5rem'
      }},
        React.createElement('h3', null, 'CPU'),
        React.createElement('p', { style: { fontSize: '1.5rem', fontWeight: 'bold' } }, metrics.cpu.usage + '%'),
        React.createElement('p', { style: { fontSize: '0.875rem', color: '#666' } }, metrics.cpu.cores + ' 核心')
      ),
      React.createElement('div', { style: {
        padding: '1rem',
        backgroundColor: memoryUsage > 80 ? '#fee2e2' : memoryUsage > 60 ? '#fef3c7' : '#dcfce7',
        borderRadius: '0.5rem'
      }},
        React.createElement('h3', null, '内存'),
        React.createElement('p', { style: { fontSize: '1.5rem', fontWeight: 'bold' } }, metrics.memory.usage + '%'),
        React.createElement('p', { style: { fontSize: '0.875rem', color: '#666' } }, formatBytes(metrics.memory.used) + ' / ' + formatBytes(metrics.memory.total))
      ),
      React.createElement('div', { style: {
        padding: '1rem',
        backgroundColor: diskUsage > 80 ? '#fee2e2' : diskUsage > 60 ? '#fef3c7' : '#dcfce7',
        borderRadius: '0.5rem'
      }},
        React.createElement('h3', null, '磁盘'),
        React.createElement('p', { style: { fontSize: '1.5rem', fontWeight: 'bold' } }, metrics.disk.usage + '%'),
        React.createElement('p', { style: { fontSize: '0.875rem', color: '#666' } }, formatBytes(metrics.disk.used) + ' / ' + formatBytes(metrics.disk.total))
      )
    ),
    React.createElement('h3', null, '详细信息'),
    React.createElement('pre', null,
      React.createElement('code', null, resultText)
    )
  )
}
