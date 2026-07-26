import React from 'react'

export interface ConversationItem {
  id: string
  title: string
  timestamp: number
  provider: string
  model: string
}

export interface FileTreeNode {
  name: string
  path: string
  children?: FileTreeNode[]
  isFile?: boolean
}

export interface GitTrackedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'unmodified'
  staged?: boolean
}

export interface DesktopConfig {
  provider: string
  apiKey: string
  model: string
  workingDir: string
}

interface DesktopFourPaneProps {
  config: DesktopConfig
  activeConversation: string
  messages: Array<{ id: string; role: string; content: string }>
  onSend: (content: string) => void
  isProcessing: boolean
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#000000',
    color: '#F5F5F5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
  },
  sidebar: {
    width: 240,
    minWidth: 240,
    backgroundColor: '#0A0A0A',
    borderRight: '1px solid #262626',
    display: 'flex',
    flexDirection: 'column',
  },
  chatView: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#000000',
    minWidth: 0,
  },
  fileTree: {
    width: 260,
    minWidth: 260,
    backgroundColor: '#0A0A0A',
    borderLeft: '1px solid #262626',
    borderRight: '1px solid #262626',
    overflowY: 'auto',
  },
  gitPanel: {
    width: 280,
    minWidth: 280,
    backgroundColor: '#0A0A0A',
    borderLeft: '1px solid #262626',
    overflowY: 'auto',
  },
  sidebarHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #262626',
    fontSize: '14px',
    fontWeight: 600,
  },
  conversationItem: {
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #1A1A1A',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
  },
  chatInput: {
    padding: '16px 24px',
    borderTop: '1px solid #262626',
  },
  inputBox: {
    width: '100%',
    backgroundColor: '#0F0F0F',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#F5F5F5',
    fontSize: '13px',
    outline: 'none',
  },
  messageBubble: {
    marginBottom: '16px',
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#1A1A1A',
    padding: '10px 14px',
    borderRadius: '8px',
    marginLeft: 'auto',
  },
  assistantBubble: {
    backgroundColor: '#0F0F0F',
    padding: '10px 14px',
    borderRadius: '8px',
  },
  panelHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #262626',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#888888',
  },
  fileItem: {
    padding: '4px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  gitItem: {
    padding: '6px 16px',
    fontSize: '13px',
    borderBottom: '1px solid #1A1A1A',
    display: 'flex',
    justifyContent: 'space-between',
  },
}

export function DesktopFourPane(props: DesktopFourPaneProps): JSX.Element {
  const { config, messages, onSend, isProcessing } = props

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = (e.target as HTMLFormElement).elements.namedItem('msg') as HTMLInputElement
    const val = input.value.trim()
    if (val) {
      onSend(val)
      input.value = ''
    }
  }

  return (
    <div style={styles.container}>
      {/* 左栏：对话列表 */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>Doge Code</div>
        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#888888' }}>
          {config.provider} / {config.model}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <div style={{ padding: '16px', color: '#555555', fontSize: '12px' }}>
              暂无对话
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={styles.conversationItem}>
                <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div style={{ fontSize: '11px', color: '#555555', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.content.slice(0, 40)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 中栏：聊天界面 */}
      <div style={styles.chatView}>
        <div style={styles.chatMessages}>
          {messages.map((m) => (
            <div key={m.id} style={{ ...styles.messageBubble, ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble) }}>
              <div style={{ fontSize: '11px', color: '#888888', marginBottom: '4px' }}>
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{m.content}</div>
            </div>
          ))}
          {isProcessing && <div style={{ color: '#888888', fontSize: '12px' }}>Thinking...</div>}
        </div>
        <div style={styles.chatInput}>
          <form onSubmit={handleSubmit}>
            <input
              name="msg"
              type="text"
              placeholder="输入消息..."
              style={styles.inputBox}
              autoFocus
            />
          </form>
        </div>
      </div>

      {/* 右栏1：项目文件树 */}
      <div style={styles.fileTree}>
        <div style={styles.panelHeader}>文件树</div>
        <div style={{ padding: '8px 0' }}>
          <div style={styles.fileItem}>📁 src</div>
          <div style={{ ...styles.fileItem, paddingLeft: '32px' }}>📄 index.ts</div>
          <div style={{ ...styles.fileItem, paddingLeft: '32px' }}>📄 bootstrap-entry.ts</div>
          <div style={styles.fileItem}>📁 commands</div>
          <div style={styles.fileItem}>📁 components</div>
          <div style={styles.fileItem}>📁 engine</div>
          <div style={styles.fileItem}>📄 package.json</div>
        </div>
      </div>

      {/* 右栏2：Git 文件列表 */}
      <div style={styles.gitPanel}>
        <div style={styles.panelHeader}>Git 变更</div>
        <div style={{ padding: '8px 0' }}>
          <div style={styles.gitItem}>
            <span>M src/bootstrap-entry.ts</span>
            <span style={{ color: '#FF6B6B' }}>modified</span>
          </div>
          <div style={styles.gitItem}>
            <span>M package.json</span>
            <span style={{ color: '#FF6B6B' }}>modified</span>
          </div>
          <div style={styles.gitItem}>
            <span>A src/desktop/types.ts</span>
            <span style={{ color: '#4ECB71' }}>added</span>
          </div>
          <div style={styles.gitItem}>
            <span>A src/desktop/desktopUI.tsx</span>
            <span style={{ color: '#4ECB71' }}>added</span>
          </div>
        </div>
      </div>
    </div>
  )
}
