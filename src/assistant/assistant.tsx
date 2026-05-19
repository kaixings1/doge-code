import * as React from 'react'
import { useEffect, useState } from 'react'
import type { AssistantSession } from './sessionHistory.js'

/**
 * 新安装向导组件
 * 
 * 提供交互式的助手模式设置向导
 */
export function NewInstallWizard(props: {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(1)
  const [installDir, setInstallDir] = useState(props.defaultDir)
  const [isLoading, setIsLoading] = useState(false)

  const handleNext = async () => {
    setIsLoading(true)
    try {
      if (currentStep === 1) {
        // 验证目录
        if (!installDir.trim()) {
          props.onError('请指定安装目录')
          setIsLoading(false)
          return
        }
        setCurrentStep(2)
      } else if (currentStep === 2) {
        // 执行安装
        props.onInstalled(installDir)
      }
    } catch (error) {
      props.onError(error instanceof Error ? error.message : '安装失败')
    } finally {
      setIsLoading(false)
    }
  }

  return React.createElement('div', { className: 'wizard-container' },
    React.createElement('h2', null, '助手模式安装向导'),
    React.createElement('div', { className: 'wizard-steps' },
      React.createElement('div', { 
        className: `step ${currentStep >= 1 ? 'active' : ''}` },
        '步骤 1: 选择目录'
      ),
      React.createElement('div', { 
        className: `step ${currentStep >= 2 ? 'active' : ''}` },
        '步骤 2: 确认安装'
      )
    ),
    React.createElement('div', { className: 'wizard-content' },
      currentStep === 1 && React.createElement('div', null,
        React.createElement('p', null, '请选择助手模式的安装目录:'),
        React.createElement('input', {
          type: 'text',
          value: installDir,
          onChange: (e) => setInstallDir(e.target.value),
          placeholder: '输入目录路径',
          disabled: isLoading
        })
      ),
      currentStep === 2 && React.createElement('div', null,
        React.createElement('p', null, `准备安装到: ${installDir}`),
        React.createElement('p', { className: 'warning' }, 
          '这将配置助手模式相关设置。'
        )
      )
    ),
    React.createElement('div', { className: 'wizard-actions' },
      React.createElement('button', {
        onClick: props.onCancel,
        disabled: isLoading
      }, '取消'),
      currentStep > 1 && React.createElement('button', {
        onClick: () => setCurrentStep(currentStep - 1),
        disabled: isLoading
      }, '上一步'),
      React.createElement('button', {
        onClick: handleNext,
        disabled: isLoading
      }, isLoading ? '处理中...' : (currentStep === 2 ? '确认安装' : '下一步'))
    )
  )
}

/**
 * 计算默认安装目录
 */
export async function computeDefaultInstallDir(): Promise<string> {
  try {
    // 尝试从环境变量或配置中获取默认目录
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    if (homeDir) {
      return `${homeDir}/.claude/assistant`
    }
    return './claude-assistant'
  } catch (error) {
    return './claude-assistant'
  }
}

/**
 * 助手会话选择器组件
 */
export const AssistantSessionChooser: React.FC<{
  sessions: AssistantSession[]
  onSelect: (sessionId: string) => void
  onClose: () => void
}> = ({ sessions, onSelect, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>('')

  const handleSelect = () => {
    if (selectedId) {
      onSelect(selectedId)
    }
  }

  return React.createElement('div', { className: 'session-chooser' },
    React.createElement('h3', null, '选择助手会话'),
    React.createElement('div', { className: 'session-list' },
      sessions.map(session => 
        React.createElement('div', {
          key: session.id,
          className: `session-item ${session.id === selectedId ? 'selected' : ''}`,
          onClick: () => setSelectedId(session.id)
        },
          React.createElement('div', { className: 'session-title' }, session.title),
          React.createElement('div', { className: 'session-meta' },
            `创建于: ${new Date(session.createdAt).toLocaleString()}`
          )
        )
      )
    ),
    React.createElement('div', { className: 'chooser-actions' },
      React.createElement('button', { onClick: onClose }, '取消'),
      React.createElement('button', {
        onClick: handleSelect,
        disabled: !selectedId
      }, '选择会话')
    )
  )
}
