import * as React from 'react'
import type { AssistantSession } from './sessionHistory.js'

/**
 * 助手会话选择器组件
 * 
 * 用于在多个助手会话之间进行选择
 */
export const AssistantSessionChooser: React.FC<{
  sessions: AssistantSession[]
  onSelect: (sessionId: string) => void
  onClose: () => void
  title?: string
}> = ({ sessions, onSelect, onClose, title = '选择助手会话' }) => {
  const [selectedId, setSelectedId] = React.useState<string>('')
  const [filter, setFilter] = React.useState<'all' | 'active' | 'ended'>('all')

  const filteredSessions = sessions.filter(session => {
    if (filter === 'active') return session.status === 'active'
    if (filter === 'ended') return session.status === 'ended'
    return true
  })

  const handleSelect = () => {
    if (selectedId) {
      onSelect(selectedId)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  return React.createElement('div', 
    { 
      className: 'assistant-session-chooser',
      style: {
        padding: '20px',
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        maxWidth: '600px'
      }
    },
    React.createElement('h2', 
      { style: { marginTop: 0, color: '#fff' } }, 
      title
    ),
    React.createElement('div', 
      { style: { marginBottom: '16px' } },
      React.createElement('label', 
        { style: { color: '#ccc', marginRight: '8px' } },
        '筛选: '
      ),
      React.createElement('select', {
        value: filter,
        onChange: (e) => setFilter(e.target.value as any),
        style: {
          padding: '4px 8px',
          backgroundColor: '#2d2d2d',
          color: '#fff',
          border: '1px solid #444',
          borderRadius: '4px'
        }
      },
        React.createElement('option', { value: 'all' }, '全部会话'),
        React.createElement('option', { value: 'active' }, '活跃会话'),
        React.createElement('option', { value: 'ended' }, '已结束会话')
      )
    ),
    React.createElement('div',
      { 
        className: 'session-list',
        style: {
          maxHeight: '400px',
          overflowY: 'auto',
          marginBottom: '16px',
          border: '1px solid #333',
          borderRadius: '4px'
        }
      },
      filteredSessions.length === 0 && React.createElement('div',
        { style: { padding: '20px', textAlign: 'center', color: '#888' } },
        '暂无会话'
      ),
      filteredSessions.map(session => 
        React.createElement('div', {
          key: session.id,
          className: `session-item ${session.id === selectedId ? 'selected' : ''}`,
          onClick: () => setSelectedId(session.id),
          style: {
            padding: '12px',
            cursor: 'pointer',
            borderBottom: '1px solid #333',
            backgroundColor: session.id === selectedId ? '#2d5a87' : 'transparent',
            transition: 'background-color 0.2s'
          },
          onMouseEnter: (e) => {
            if (session.id !== selectedId) {
              e.currentTarget.style.backgroundColor = '#2a2a2a'
            }
          },
          onMouseLeave: (e) => {
            if (session.id !== selectedId) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }
        },
          React.createElement('div', {
            className: 'session-title',
            style: {
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '4px'
            }
          }, session.title),
          React.createElement('div', {
            className: 'session-meta',
            style: {
              fontSize: '12px',
              color: '#888'
            }
          },
            React.createElement('span', null,
              `创建于: ${formatDate(session.createdAt)}`
            ),
            React.createElement('span', { style: { marginLeft: '16px' } },
              `消息数: ${session.messageCount}`
            ),
            React.createElement('span', 
              { 
                style: { 
                  marginLeft: '16px',
                  color: session.status === 'active' ? '#4caf50' : '#999'
                }
              },
              session.status === 'active' ? '活跃' : '已结束'
            )
          )
        )
      )
    ),
    React.createElement('div',
      { className: 'chooser-actions', style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
      React.createElement('button', {
        onClick: onClose,
        style: {
          padding: '8px 16px',
          backgroundColor: '#444',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }
      }, '取消'),
      React.createElement('button', {
        onClick: handleSelect,
        disabled: !selectedId,
        style: {
          padding: '8px 16px',
          backgroundColor: selectedId ? '#007acc' : '#555',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: selectedId ? 'pointer' : 'not-allowed'
        }
      }, '选择会话')
    )
  )
}

export default AssistantSessionChooser
