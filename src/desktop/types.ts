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
